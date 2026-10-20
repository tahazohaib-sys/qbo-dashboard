import { NextResponse } from "next/server";
import { fromMinorUnits, stripeGet, stripeListAll } from "@/lib/stripe";

// Stripe Financials: balance, monthly activity from balance transactions,
// payouts, MRR from active subscriptions and top customers.
// Query: from=YYYY-MM-DD, to=YYYY-MM-DD (UTC). Default is the last 12 months.

type BalanceTxn = {
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
  reporting_category: string;
  type: string;
  source:
    | null
    | string
    | {
        object?: string;
        customer?: string | null;
        billing_details?: { name?: string | null; email?: string | null };
        receipt_email?: string | null;
      };
};

type Payout = {
  id: string;
  amount: number;
  currency: string;
  arrival_date: number;
  created: number;
  status: string;
  method: string;
  description: string | null;
};

type Subscription = {
  id: string;
  currency: string;
  items: {
    data: Array<{
      quantity?: number;
      price: {
        unit_amount: number | null;
        currency: string;
        recurring: { interval: "day" | "week" | "month" | "year"; interval_count: number } | null;
      };
    }>;
  };
};

type MonthRow = {
  month: string;
  gross: number;
  refunds: number;
  disputes: number;
  fees: number;
  net: number;
  payouts: number;
  chargeCount: number;
};

function parseDate(v: string | null, endOfDay: boolean): number | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKey(unix: number) {
  return new Date(unix * 1000).toISOString().slice(0, 7);
}

function monthsBetween(fromUnix: number, toUnix: number) {
  const out: string[] = [];
  const d = new Date(fromUnix * 1000);
  d.setUTCDate(1);
  const end = monthKey(toUnix);
  while (out.length < 240) {
    const k = d.toISOString().slice(0, 7);
    out.push(k);
    if (k >= end) break;
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function monthlyFactor(interval: string, count: number) {
  const n = count || 1;
  if (interval === "day") return 365 / 12 / n;
  if (interval === "week") return 52 / 12 / n;
  if (interval === "year") return 1 / 12 / n;
  return 1 / n;
}

function customerLabel(src: BalanceTxn["source"]) {
  if (!src || typeof src === "string") return "Unknown";
  return src.billing_details?.name || src.billing_details?.email || src.receipt_email || src.customer || "Guest";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const fromUnix = parseDate(url.searchParams.get("from"), false) ?? parseDate(ymd(defaultFrom), false)!;
    const toUnix = parseDate(url.searchParams.get("to"), true) ?? parseDate(ymd(now), true)!;
    if (fromUnix > toUnix) {
      return NextResponse.json({ ok: false, error: "The From date must be before the To date." }, { status: 400 });
    }

    const [balance, txns, payouts, subs] = await Promise.all([
      stripeGet<{
        available: Array<{ amount: number; currency: string }>;
        pending: Array<{ amount: number; currency: string }>;
      }>("/balance"),
      stripeListAll<BalanceTxn>("/balance_transactions", {
        "created[gte]": fromUnix,
        "created[lte]": toUnix,
        expand: ["data.source"],
      }),
      stripeListAll<Payout>("/payouts", { "created[gte]": fromUnix, "created[lte]": toUnix }, 1000),
      stripeListAll<Subscription>("/subscriptions", { status: "active" }, 2000),
    ]);

    const months = monthsBetween(fromUnix, toUnix);
    const currencies = new Set<string>();
    const monthly = new Map<string, Map<string, MonthRow>>(); // currency -> month -> row
    const customers = new Map<string, Map<string, { gross: number; count: number }>>(); // currency -> label -> totals

    const rowFor = (currency: string, month: string) => {
      if (!monthly.has(currency)) {
        const m = new Map<string, MonthRow>();
        for (const k of months) {
          m.set(k, { month: k, gross: 0, refunds: 0, disputes: 0, fees: 0, net: 0, payouts: 0, chargeCount: 0 });
        }
        monthly.set(currency, m);
      }
      const m = monthly.get(currency)!;
      if (!m.has(month)) {
        m.set(month, { month, gross: 0, refunds: 0, disputes: 0, fees: 0, net: 0, payouts: 0, chargeCount: 0 });
      }
      return m.get(month)!;
    };

    for (const t of txns.data) {
      const cur = t.currency.toLowerCase();
      currencies.add(cur);
      const row = rowFor(cur, monthKey(t.created));
      const amount = fromMinorUnits(t.amount, cur);
      const fee = fromMinorUnits(t.fee, cur);
      const net = fromMinorUnits(t.net, cur);
      const cat = t.reporting_category;

      if (cat.startsWith("payout")) {
        // Payouts move money to the bank. They are not income or cost.
        row.payouts += -amount;
        continue;
      }

      if (cat === "charge") {
        row.gross += amount;
        row.chargeCount += 1;
        if (!customers.has(cur)) customers.set(cur, new Map());
        const label = customerLabel(t.source);
        const c = customers.get(cur)!.get(label) ?? { gross: 0, count: 0 };
        c.gross += amount;
        c.count += 1;
        customers.get(cur)!.set(label, c);
      } else if (cat === "refund" || cat === "partial_capture_reversal") {
        row.refunds += -amount;
      } else if (cat === "dispute" || cat === "dispute_reversal") {
        row.disputes += -amount;
      } else if (cat === "fee") {
        row.fees += -amount;
      }
      row.fees += fee;
      row.net += net;
    }

    // MRR from active subscriptions (list price x quantity, discounts not applied).
    const mrr = new Map<string, number>();
    let subsSkippedItems = 0;
    for (const s of subs.data) {
      for (const item of s.items?.data ?? []) {
        const p = item.price;
        if (!p?.recurring || p.unit_amount == null) {
          subsSkippedItems += 1;
          continue;
        }
        const cur = p.currency.toLowerCase();
        currencies.add(cur);
        const value = fromMinorUnits(p.unit_amount, cur) * (item.quantity ?? 1) * monthlyFactor(p.recurring.interval, p.recurring.interval_count);
        mrr.set(cur, (mrr.get(cur) ?? 0) + value);
      }
    }

    for (const b of [...balance.available, ...balance.pending]) currencies.add(b.currency.toLowerCase());

    const byCurrency = Array.from(currencies)
      .sort()
      .map((cur) => {
        const rows = Array.from(monthly.get(cur)?.values() ?? [])
          .sort((a, b) => a.month.localeCompare(b.month))
          .map((r) => ({
            ...r,
            gross: round2(r.gross),
            refunds: round2(r.refunds),
            disputes: round2(r.disputes),
            fees: round2(r.fees),
            net: round2(r.net),
            payouts: round2(r.payouts),
          }));
        const totals = rows.reduce(
          (acc, r) => ({
            gross: acc.gross + r.gross,
            refunds: acc.refunds + r.refunds,
            disputes: acc.disputes + r.disputes,
            fees: acc.fees + r.fees,
            net: acc.net + r.net,
            payouts: acc.payouts + r.payouts,
            chargeCount: acc.chargeCount + r.chargeCount,
          }),
          { gross: 0, refunds: 0, disputes: 0, fees: 0, net: 0, payouts: 0, chargeCount: 0 }
        );
        const topCustomers = Array.from(customers.get(cur)?.entries() ?? [])
          .map(([customer, v]) => ({ customer, gross: round2(v.gross), count: v.count }))
          .sort((a, b) => b.gross - a.gross)
          .slice(0, 10);
        const sumBal = (list: Array<{ amount: number; currency: string }>) =>
          list.filter((b) => b.currency.toLowerCase() === cur).reduce((s, b) => s + fromMinorUnits(b.amount, cur), 0);

        return {
          currency: cur,
          balance: { available: round2(sumBal(balance.available)), pending: round2(sumBal(balance.pending)) },
          mrr: round2(mrr.get(cur) ?? 0),
          totals: {
            ...totals,
            gross: round2(totals.gross),
            refunds: round2(totals.refunds),
            disputes: round2(totals.disputes),
            fees: round2(totals.fees),
            net: round2(totals.net),
            payouts: round2(totals.payouts),
          },
          monthly: rows,
          topCustomers,
        };
      });

    // Show the currency with the most gross volume first.
    byCurrency.sort((a, b) => b.totals.gross - a.totals.gross || a.currency.localeCompare(b.currency));

    const recentPayouts = payouts.data
      .slice()
      .sort((a, b) => b.created - a.created)
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        amount: round2(fromMinorUnits(p.amount, p.currency)),
        currency: p.currency.toLowerCase(),
        arrivalDate: ymd(new Date(p.arrival_date * 1000)),
        status: p.status,
        method: p.method,
        description: p.description,
      }));

    return NextResponse.json({
      ok: true,
      range: { from: ymd(new Date(fromUnix * 1000)), to: ymd(new Date(toUnix * 1000)) },
      byCurrency,
      recentPayouts,
      activeSubscriptions: subs.data.length,
      notes: {
        transactionsTruncated: txns.truncated,
        payoutsTruncated: payouts.truncated,
        subscriptionsTruncated: subs.truncated,
        subsSkippedItems,
        transactionCount: txns.data.length,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Stripe request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
