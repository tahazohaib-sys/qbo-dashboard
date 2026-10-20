"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

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

type CurrencyBlock = {
  currency: string;
  balance: { available: number; pending: number };
  mrr: number;
  totals: Omit<MonthRow, "month">;
  monthly: MonthRow[];
  topCustomers: Array<{ customer: string; gross: number; count: number }>;
};

type ApiResp =
  | {
      ok: true;
      range: { from: string; to: string };
      byCurrency: CurrencyBlock[];
      recentPayouts: Array<{
        id: string;
        amount: number;
        currency: string;
        arrivalDate: string;
        status: string;
        method: string;
        description: string | null;
      }>;
      activeSubscriptions: number;
      notes: {
        transactionsTruncated: boolean;
        payoutsTruncated: boolean;
        subscriptionsTruncated: boolean;
        subsSkippedItems: number;
        transactionCount: number;
      };
    }
  | { ok: false; error: string };

const AXIS_TICK = { fill: "#e2e8f0", fontSize: 12, fontWeight: 600 } as const;
const AXIS_LINE = { stroke: "rgba(226,232,240,0.55)" } as const;
const GRID = { strokeDasharray: "3 3", opacity: 0.22 } as const;

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(n);
  } catch {
    return `${currency.toUpperCase()} ${n.toFixed(2)}`;
  }
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtAxisShort(v: number | string) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from: ymd(from), to: ymd(now) };
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 border-l-4 ${tone} bg-white/5 p-4`}>
      <div className="text-[11px] uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">{title}</div>
      {children}
    </div>
  );
}

type TooltipItem = { dataKey?: string | number; name?: string; value?: number | string };

function MoneyTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-slate-100">
      <div className="font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="text-slate-300">{p.name ?? p.dataKey}</span>
          <span className="font-semibold">{fmtMoney(Number(p.value ?? 0), currency)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StripeFinancialsPageClient() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<string>("");

  async function fetchData() {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ from, to });
      const res = await fetch(`/api/stripe/financials?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResp;
      setData(json);
      if (json.ok && !json.byCurrency.some((c) => c.currency === currency)) {
        setCurrency(json.byCurrency[0]?.currency ?? "");
      }
    } catch (e: unknown) {
      setData({ ok: false, error: e instanceof Error ? e.message : "Failed to load Stripe data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = data?.ok === true;
  const block = ok ? data.byCurrency.find((c) => c.currency === currency) ?? data.byCurrency[0] : undefined;
  const cur = block?.currency ?? "usd";
  const payouts = ok ? data.recentPayouts.filter((p) => p.currency === cur) : [];
  const t = block?.totals;
  const feeRate = t && t.gross ? t.fees / t.gross : 0;
  const refundRate = t && t.gross ? t.refunds / t.gross : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(99,102,241,0.14),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(34,211,238,0.10),transparent_55%),linear-gradient(180deg,#050814_0%,#070b1a_45%,#050814_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Stripe Financials</h1>
            <p className="mt-1 text-sm text-slate-400">Balance · Gross volume · Fees · Refunds · Payouts · MRR</p>
            <div className="mt-2 h-[2px] w-32 rounded-full bg-gradient-to-r from-indigo-400/80 via-sky-400/60 to-transparent" />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              prefetch={false}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div>
            <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none focus:border-cyan-300/40"
            />
          </div>
          <div>
            <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none focus:border-cyan-300/40"
            />
          </div>
          {ok && data.byCurrency.length > 1 ? (
            <div>
              <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">Currency</label>
              <select
                value={cur}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 block rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none focus:border-cyan-300/40"
              >
                {data.byCurrency.map((c) => (
                  <option key={c.currency} value={c.currency}>
                    {c.currency.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-indigo-500/20 px-4 py-2 text-sm font-semibold hover:bg-indigo-500/30 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Apply"}
          </button>
        </div>

        {data && !data.ok ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{data.error}</div>
        ) : null}

        {ok && (data.notes.transactionsTruncated || data.notes.payoutsTruncated || data.notes.subscriptionsTruncated) ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Stripe has more records than this page reads at one time. Use a shorter date range for complete totals.
          </div>
        ) : null}

        {!data && loading ? <div className="mt-6 text-slate-300">Loading Stripe data…</div> : null}

        {ok && !block ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">
            No Stripe activity in this date range.
          </div>
        ) : null}

        {ok && block && t ? (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Available balance" value={fmtMoney(block.balance.available, cur)} sub={`Pending ${fmtMoney(block.balance.pending, cur)}`} tone="border-l-emerald-400/60" />
              <Kpi label="Gross volume" value={fmtMoney(t.gross, cur)} sub={`${t.chargeCount} charges`} tone="border-l-sky-400/60" />
              <Kpi label="Net revenue" value={fmtMoney(t.net, cur)} sub="After fees, refunds and disputes" tone="border-l-indigo-400/60" />
              <Kpi label="MRR" value={fmtMoney(block.mrr, cur)} sub={`${data.activeSubscriptions} active subscriptions`} tone="border-l-fuchsia-400/60" />
              <Kpi label="Stripe fees" value={fmtMoney(t.fees, cur)} sub={`${fmtPct(feeRate)} of gross`} tone="border-l-amber-400/60" />
              <Kpi label="Refunds" value={fmtMoney(t.refunds, cur)} sub={`${fmtPct(refundRate)} of gross`} tone="border-l-rose-400/60" />
              <Kpi label="Disputes" value={fmtMoney(t.disputes, cur)} tone="border-l-rose-400/60" />
              <Kpi label="Payouts to bank" value={fmtMoney(t.payouts, cur)} tone="border-l-white/20" />
            </div>

            <Panel title="Monthly gross vs net">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={block.monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickFormatter={fmtAxisShort} />
                    <Tooltip content={<MoneyTooltip currency={cur} />} />
                    <Legend />
                    <Bar dataKey="gross" name="Gross" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="fees" name="Fees" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="refunds" name="Refunds" fill="#fb7185" radius={[6, 6, 0, 0]} />
                    <Line dataKey="net" name="Net" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Monthly payouts">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={block.monthly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickFormatter={fmtAxisShort} />
                      <Tooltip content={<MoneyTooltip currency={cur} />} />
                      <Bar dataKey="payouts" name="Payouts" fill="#34d399" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Top customers by gross">
                {block.topCustomers.length ? (
                  <table className="w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="py-1">Customer</th>
                        <th className="py-1 text-right">Charges</th>
                        <th className="py-1 text-right">Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.topCustomers.map((c) => (
                        <tr key={c.customer} className="border-t border-white/5">
                          <td className="py-1.5 pr-2 break-all">{c.customer}</td>
                          <td className="py-1.5 text-right">{c.count}</td>
                          <td className="py-1.5 text-right font-semibold">{fmtMoney(c.gross, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-slate-300">No charges in this range.</div>
                )}
              </Panel>
            </div>

            <Panel title="Monthly breakdown">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="py-1">Month</th>
                      <th className="py-1 text-right">Charges</th>
                      <th className="py-1 text-right">Gross</th>
                      <th className="py-1 text-right">Refunds</th>
                      <th className="py-1 text-right">Disputes</th>
                      <th className="py-1 text-right">Fees</th>
                      <th className="py-1 text-right">Net</th>
                      <th className="py-1 text-right">Payouts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.monthly.map((r) => (
                      <tr key={r.month} className="border-t border-white/5">
                        <td className="py-1.5">{r.month}</td>
                        <td className="py-1.5 text-right">{r.chargeCount}</td>
                        <td className="py-1.5 text-right">{fmtMoney(r.gross, cur)}</td>
                        <td className="py-1.5 text-right text-rose-300">{fmtMoney(r.refunds, cur)}</td>
                        <td className="py-1.5 text-right text-rose-300">{fmtMoney(r.disputes, cur)}</td>
                        <td className="py-1.5 text-right text-amber-300">{fmtMoney(r.fees, cur)}</td>
                        <td className="py-1.5 text-right font-semibold">{fmtMoney(r.net, cur)}</td>
                        <td className="py-1.5 text-right text-emerald-300">{fmtMoney(r.payouts, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Recent payouts">
              {payouts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="py-1">Arrival date</th>
                        <th className="py-1">Status</th>
                        <th className="py-1">Method</th>
                        <th className="py-1">Description</th>
                        <th className="py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((p) => (
                        <tr key={p.id} className="border-t border-white/5">
                          <td className="py-1.5">{p.arrivalDate}</td>
                          <td className="py-1.5 capitalize">{p.status.replace(/_/g, " ")}</td>
                          <td className="py-1.5 capitalize">{p.method}</td>
                          <td className="py-1.5 text-slate-300">{p.description || "—"}</td>
                          <td className="py-1.5 text-right font-semibold">{fmtMoney(p.amount, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-slate-300">No payouts in this range.</div>
              )}
            </Panel>

            <div className="text-xs text-slate-500">
              {data.notes.transactionCount} balance transactions read for {data.range.from} to {data.range.to}. MRR uses list
              prices of active subscriptions and does not include discounts.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
