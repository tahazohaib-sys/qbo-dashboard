// src/app/api/export/powerpoint/route.ts
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";
import { buildPresentation, PptxPayload } from "@/lib/pptx-generator";

export const dynamic = "force-dynamic";
// Increase max duration for long data-fetch + PPTX generation
export const maxDuration = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function moneyNum(v: any): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseYMD(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthsBetween(start: Date, end: Date) {
  const out: { label: string; start: string; end: string }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const s = new Date(y, m, 1) < start ? start : new Date(y, m, 1);
    const e = new Date(y, m + 1, 0) > end ? end : new Date(y, m + 1, 0);
    out.push({ label: `${y}-${String(m + 1).padStart(2, "0")}`, start: formatYMD(s), end: formatYMD(e) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// ─── P&L totals for one period ────────────────────────────────────────────────

function findGroup(rows: any, group: string): number | null {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!Array.isArray(arr)) return null;
  for (const r of arr) {
    if (String(r?.group ?? "") === group && String(r?.type ?? "") === "Section") {
      const cd = r?.Summary?.ColData;
      if (Array.isArray(cd) && cd.length > 0) return moneyNum(cd[cd.length - 1]?.value);
      return 0;
    }
    if (r?.Rows) { const h = findGroup(r.Rows, group); if (h != null) return h; }
  }
  return null;
}

async function fetchPnlTotals(start: string, end: string, method: string) {
  const pnl = await qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
  );
  const currency = pnl?.Header?.Currency ?? "PKR";
  const revenue  = findGroup(pnl?.Rows, "Income")        ?? 0;
  const expenses = (findGroup(pnl?.Rows, "Expenses") ?? 0) + (findGroup(pnl?.Rows, "OtherExpenses") ?? 0);
  const profit   = findGroup(pnl?.Rows, "NetIncome")     ?? revenue - expenses;
  return { revenue, expenses, profit, currency };
}

// ─── Expense breakdown ────────────────────────────────────────────────────────

function flattenExpenseRows(rows: any, path: string[] = [], out: { label: string; amount: number }[] = []) {
  const arr = rows?.Row;
  if (!Array.isArray(arr)) return out;
  for (const r of arr) {
    if (r?.type === "Section") {
      const header = r?.Header?.ColData?.[0]?.value ?? "";
      flattenExpenseRows(r?.Rows, header ? [...path, header] : path, out);
    } else {
      const label  = r?.ColData?.[0]?.value ?? "";
      const amount = moneyNum(r?.ColData?.[r?.ColData?.length - 1]?.value);
      const p      = path.join(" > ");
      if ((p.includes("Expenses") || p.includes("Other Expenses")) && r?.type === "Data" && label && amount !== 0) {
        out.push({ label, amount });
      }
    }
  }
  return out;
}

async function fetchExpenseBreakdown(start: string, end: string, method: string) {
  const pnl = await qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
  );
  const rows = flattenExpenseRows(pnl?.Rows);
  const map  = new Map<string, number>();
  for (const r of rows) map.set(r.label, (map.get(r.label) ?? 0) + r.amount);
  const sorted = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const top  = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((s, x) => s + x.value, 0);
  return rest > 0 ? [...top, { name: "Other", value: rest }] : top;
}

// ─── Cash accounts ────────────────────────────────────────────────────────────

async function fetchCashAccounts() {
  const bankQ = `SELECT Id, Name, AccountType, AccountSubType, CurrencyRef, CurrentBalance FROM Account WHERE AccountType = 'Bank' AND Active = true ORDER BY Name`;
  const cashQ = `SELECT Id, Name, AccountType, AccountSubType, CurrencyRef, CurrentBalance FROM Account WHERE AccountSubType = 'CashOnHand' AND Active = true ORDER BY Name`;
  const [bankRes, cashRes] = await Promise.all([
    qboFetch(`query?query=${encodeURIComponent(bankQ)}`),
    qboFetch(`query?query=${encodeURIComponent(cashQ)}`),
  ]);
  const all = [
    ...(bankRes?.QueryResponse?.Account ?? []),
    ...(cashRes?.QueryResponse?.Account ?? []),
  ];
  const seen = new Set<string>();
  const accounts = all
    .filter((a: any) => { if (seen.has(a.Id)) return false; seen.add(a.Id); return true; })
    .map((a: any) => ({
      name: String(a?.Name ?? ""),
      currency: a?.CurrencyRef?.value ?? "PKR",
      currentBalance: moneyNum(a?.CurrentBalance),
    }))
    .filter((a) => Math.abs(a.currentBalance) > 0);
  const totals: Record<string, number> = {};
  for (const a of accounts) totals[a.currency] = (totals[a.currency] ?? 0) + a.currentBalance;
  return { accounts, totals };
}

// ─── AR/AP snapshot ───────────────────────────────────────────────────────────

async function fetchArApSnapshot(asOf: string, method: string): Promise<PptxPayload["arAp"]> {
  try {
    const bs = await qboFetch(
      `reports/BalanceSheet?as_of_date=${encodeURIComponent(asOf)}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
    );
    const currency = bs?.Header?.Currency ?? "PKR";

    function findBSGroup(rows: any, name: string): number {
      const arr = rows?.Row ?? rows;
      if (!Array.isArray(arr)) return 0;
      for (const r of arr) {
        const label = String(r?.Header?.ColData?.[0]?.value ?? r?.ColData?.[0]?.value ?? "");
        if (label.toLowerCase().includes(name.toLowerCase())) {
          const cd = r?.Summary?.ColData ?? r?.ColData ?? [];
          if (cd.length > 0) return moneyNum(cd[cd.length - 1]?.value);
        }
        if (r?.Rows) { const h = findBSGroup(r.Rows, name); if (h) return h; }
      }
      return 0;
    }
    const ap = findBSGroup(bs?.Rows, "Accounts Payable");
    const ar = findBSGroup(bs?.Rows, "Accounts Receivable");

    // AP Aging
    const aging = await qboFetch(
      `reports/AgedPayableDetail?as_of_date=${encodeURIComponent(asOf)}`
    ).catch(() => null);

    const vendors: PptxPayload["arAp"] extends null ? never : NonNullable<PptxPayload["arAp"]>["apAging"] = [];
    if (aging?.Rows?.Row) {
      for (const r of aging.Rows.Row) {
        if (r?.type !== "Section") continue;
        const vendor = r?.Header?.ColData?.[0]?.value ?? "";
        if (!vendor || vendor === "Accounts Payable") continue;
        const cd = r?.Summary?.ColData ?? [];
        vendors.push({
          vendor,
          current:   moneyNum(cd[1]?.value),
          "1_30":    moneyNum(cd[2]?.value),
          "31_60":   moneyNum(cd[3]?.value),
          "61_90":   moneyNum(cd[4]?.value),
          "91_plus": moneyNum(cd[5]?.value),
          total:     moneyNum(cd[cd.length - 1]?.value),
        });
      }
    }

    return { totalPayables: ap, totalReceivables: ar, asOf, apAging: vendors };
  } catch {
    return null;
  }
}

// ─── Forecast ────────────────────────────────────────────────────────────────

async function fetchForecast(
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>,
  baseUrl: string
): Promise<PptxPayload["forecast"]> {
  try {
    const res = await fetch(`${baseUrl}/api/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series, horizon: 6 }),
    });
    const json = await res.json();
    if (!json?.ok) return null;
    return {
      horizon:    json.horizon,
      trends:     json.trends,
      averages:   json.averages,
      benchmarks: json.benchmarks,
      forecast:   json.forecast,
    };
  } catch {
    return null;
  }
}

// ─── Retained earnings ────────────────────────────────────────────────────────

async function fetchRetained(start: string, end: string, method: string): Promise<PptxPayload["retained"]> {
  try {
    const bs = await qboFetch(
      `reports/BalanceSheet?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
    );
    function findVal(rows: any, keyword: string): number {
      const arr = rows?.Row ?? rows;
      if (!Array.isArray(arr)) return 0;
      for (const r of arr) {
        const label = String(r?.Header?.ColData?.[0]?.value ?? r?.ColData?.[0]?.value ?? "").toLowerCase();
        if (label.includes(keyword.toLowerCase())) {
          const cd = r?.Summary?.ColData ?? r?.ColData ?? [];
          if (cd.length > 0) return moneyNum(cd[cd.length - 1]?.value);
        }
        if (r?.Rows) { const h = findVal(r.Rows, keyword); if (h) return h; }
      }
      return 0;
    }
    const pnl = await qboFetch(
      `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
    );
    const netProfit   = findGroup(pnl?.Rows, "NetIncome") ?? 0;
    const ltAssets    = findVal(bs?.Rows, "Fixed Asset") + findVal(bs?.Rows, "Long-term");
    const investments = findVal(bs?.Rows, "Investment");
    const equity      = findVal(bs?.Rows, "Retained Earnings");
    return {
      netProfit,
      longTermAssets:      ltAssets,
      totalInvestments:    investments,
      contributionReceived: 0,
      retainedEarning:     equity,
    };
  } catch {
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const url    = new URL(req.url);
    const start  = url.searchParams.get("start_date") ?? "";
    const end    = url.searchParams.get("end_date")   ?? "";
    const method = (url.searchParams.get("accounting_method") ?? "Accrual") as "Accrual" | "Cash";

    const startDate = parseYMD(start);
    const endDate   = parseYMD(end);

    if (!startDate || !endDate) {
      return NextResponse.json({ ok: false, error: "start_date and end_date are required (YYYY-MM-DD)" }, { status: 400 });
    }

    // build base URL for internal forecast call
    const baseUrl = `${url.protocol}//${url.host}`;

    // fetch company info
    const companyInfo = await qboFetch("companyinfo/1");
    const companyName = companyInfo?.CompanyInfo?.CompanyName ?? companyInfo?.CompanyInfo?.LegalName ?? "Company";

    // fetch monthly P&L series
    const months = monthsBetween(startDate, endDate);
    const monthlyTotals = await Promise.all(months.map((m) => fetchPnlTotals(m.start, m.end, method)));
    const currency = monthlyTotals.find((t) => t.currency)?.currency ?? "PKR";

    const series = months.map((m, i) => ({
      month:    m.label,
      revenue:  monthlyTotals[i].revenue,
      expenses: monthlyTotals[i].expenses,
      profit:   monthlyTotals[i].profit,
    }));

    const kpis = series.reduce(
      (acc, s) => ({ revenue: acc.revenue + s.revenue, expenses: acc.expenses + s.expenses, profit: acc.profit + s.profit }),
      { revenue: 0, expenses: 0, profit: 0 }
    );

    // fetch all other data in parallel
    const [expenseBreakdown, cashData, arAp, forecast, retained] = await Promise.all([
      fetchExpenseBreakdown(start, end, method),
      fetchCashAccounts(),
      fetchArApSnapshot(end, method),
      fetchForecast(series, baseUrl),
      fetchRetained(start, end, method),
    ]);

    const payload: PptxPayload = {
      companyName,
      currency,
      dateRange: { start, end },
      method,
      series,
      kpis,
      expenseBreakdown,
      cashAccounts: cashData.accounts,
      cashTotals:   cashData.totals,
      arAp,
      forecast,
      retained,
    };

    const buffer = await buildPresentation(payload);

    const fileName = `Finance_Report_${start}_to_${end}.pptx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length":      String(buffer.length),
        "Cache-Control":       "no-store",
      },
    });
  } catch (e: any) {
    console.error("[PowerPoint export]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
