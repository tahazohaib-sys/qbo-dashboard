"use client";

import React, { useEffect, useMemo, useState } from "react";
import CashFlowDirectorReport from "@/components/CashFlowDirectorReport";
import type { DirectorReport } from "@/lib/cashflow-report";

type HeadTxn = {
  txnId: string;
  txnType: string;
  date: string;
  docNum: string;
  name: string;
  memo: string;
  amount: number;
  cashAccounts: string[];
};

type HeadSummary = {
  accountId: string;
  accountName: string;
  accountType: string;
  accountSubType: string;
  classification: string;
  amount: number;
  txnCount: number;
  transactions: HeadTxn[];
};

type CashAccountSummary = {
  accountId: string;
  accountName: string;
  accountSubType: string;
  inflow: number;
  outflow: number;
  transfersIn: number;
  transfersOut: number;
  net: number;
  txnCount: number;
};

type ReversalEntry = {
  txnId: string;
  txnType: string;
  date: string;
  docNum: string;
  name: string;
  memo: string;
  direction: "in" | "out";
};

type ReversalPair = {
  accountId: string;
  accountName: string;
  cashAccountId: string;
  cashAccountName: string;
  amount: number;
  entries: [ReversalEntry, ReversalEntry];
};

type MonthlyCashFlowResp =
  | {
      ok: true;
      month: string;
      start_date: string;
      end_date: string;
      accountingMethod: "Accrual" | "Cash";
      homeCurrency: string;
      totals: {
        inflow: number;
        outflow: number;
        net: number;
        internalTransfers: number;
        transactionCount: number;
        reversedAmount: number;
        reversedCount: number;
      };
      inflows: HeadSummary[];
      outflows: HeadSummary[];
      cashAccounts: CashAccountSummary[];
      reversals: ReversalPair[];
      directorReport: DirectorReport;
    }
  | { ok: false; error: string };

export type MonthlyCashFlowFilters = {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  method: "Accrual" | "Cash";
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_MONTHS = 36;

function monthsInRange(f: MonthlyCashFlowFilters): string[] {
  let a = f.fromYear * 12 + (f.fromMonth - 1);
  let b = f.toYear * 12 + (f.toMonth - 1);
  if (a > b) [a, b] = [b, a];
  a = Math.max(a, b - (MAX_MONTHS - 1));

  const out: string[] = [];
  for (let i = a; i <= b; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_LABELS[(m || 1) - 1]} ${y}`;
}

function formatMoney(currency: string, n: number) {
  const sign = n < 0 ? "-" : "";
  const decimals = currency === "PKR" ? 0 : 2;
  const sym = currency === "PKR" ? "Rs" : currency === "USD" ? "$" : currency;
  return `${sign}${sym} ${new Intl.NumberFormat("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n))}`;
}

function subTypeLabel(s: string) {
  if (s === "CashOnHand") return "Cash on hand";
  return s.replace(/([a-z])([A-Z])/g, "$1 $2") || "Bank";
}

type OkResp = Extract<MonthlyCashFlowResp, { ok: true }>;
type MonthResult = { ok: true; data: OkResp } | { ok: false; error: string };

/**
 * The parent gives this panel a `key` built from the applied filters, so a
 * new filter range mounts a fresh panel (new month list, empty results).
 */
export default function MonthlyCashFlowPanel({ filters }: { filters: MonthlyCashFlowFilters }) {
  const months = useMemo(() => monthsInRange(filters), [filters]);
  const [month, setMonth] = useState<string>(months[months.length - 1]);
  const [results, setResults] = useState<Record<string, MonthResult>>({});

  useEffect(() => {
    if (!month || results[month]) return;
    let cancelled = false;

    fetch(
      `/api/qbo/monthly-cashflow?month=${encodeURIComponent(month)}&accounting_method=${encodeURIComponent(filters.method)}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json: MonthlyCashFlowResp) => {
        if (!json.ok) throw new Error(json.error || "Monthly cash flow API failed");
        if (!cancelled) setResults((prev) => ({ ...prev, [month]: { ok: true, data: json } }));
      })
      .catch((e: unknown) => {
        const error = e instanceof Error ? e.message : String(e);
        if (!cancelled) setResults((prev) => ({ ...prev, [month]: { ok: false, error } }));
      });

    return () => {
      cancelled = true;
    };
  }, [month, filters.method, results]);

  const result = results[month];
  const loading = !result;
  const data = result?.ok ? result.data : null;
  const err = result && !result.ok ? result.error : "";

  const cur = data?.homeCurrency ?? "PKR";
  const hasActivity = Boolean(data && (data.inflows.length || data.outflows.length || data.cashAccounts.length));

  return (
    <div className="mt-6 space-y-5">
      <Card title="Monthly Cash Flow">
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              className={[
                "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                m === month
                  ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-50"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white",
              ].join(" ")}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          This report shows the real money that moved in and out of the company&apos;s bank and cash accounts in the selected
          month. Failed payments and returned cheques are not counted.
        </p>
      </Card>

      {err ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div> : null}

      {loading ? (
        <Card title={monthLabel(month)}>
          <div className="py-6 text-slate-300">Loading…</div>
        </Card>
      ) : data ? (
        <div className="space-y-5">
          {hasActivity ? <CashFlowDirectorReport report={data.directorReport} /> : null}

          <details className="group rounded-[24px] border border-white/10 bg-white/[0.03] p-5" open={!hasActivity}>
            <summary className="cursor-pointer select-none text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-300 marker:text-slate-500">
              Accounting detail (for the finance team)
            </summary>
            <div className="mt-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Cash inflow" value={formatMoney(cur, data.totals.inflow)} tone="text-emerald-300" />
                <Stat label="Cash outflow" value={formatMoney(cur, data.totals.outflow)} tone="text-rose-300" />
                <Stat
                  label="Net cash flow"
                  value={formatMoney(cur, data.totals.net)}
                  tone={data.totals.net >= 0 ? "text-emerald-300" : "text-rose-300"}
                />
                <Stat
                  label="Internal transfers"
                  value={formatMoney(cur, data.totals.internalTransfers)}
                  tone="text-slate-100"
                  sub="Bank / cash to bank / cash"
                />
              </div>

              {!hasActivity ? (
                <div className="mt-5">
                  <Card title={monthLabel(data.month)}>
                    <div className="py-6 text-slate-300">No entries in Bank or Cash on hand accounts in this month.</div>
                  </Card>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <HeadsTable
                      title={`Cash inflow · ${monthLabel(data.month)}`}
                      heads={data.inflows}
                      total={data.totals.inflow}
                      currency={cur}
                      barClass="bg-emerald-400/70"
                      amountClass="text-emerald-200"
                    />
                    <HeadsTable
                      title={`Cash outflow · ${monthLabel(data.month)}`}
                      heads={data.outflows}
                      total={data.totals.outflow}
                      currency={cur}
                      barClass="bg-rose-400/70"
                      amountClass="text-rose-200"
                    />
                  </div>

                  <div className="mt-5">
                    <Card title="Bank & cash accounts with entries">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-slate-400">
                              <th className="py-2 pr-3 font-semibold">Account</th>
                              <th className="py-2 pr-3 font-semibold">Detail type</th>
                              <th className="py-2 pr-3 text-right font-semibold">Inflow</th>
                              <th className="py-2 pr-3 text-right font-semibold">Outflow</th>
                              <th className="py-2 pr-3 text-right font-semibold">Transfers (net)</th>
                              <th className="py-2 pr-3 text-right font-semibold">Net change</th>
                              <th className="py-2 text-right font-semibold">Entries</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.cashAccounts.map((a) => (
                              <tr key={a.accountId} className="border-b border-white/5">
                                <td className="py-2 pr-3 font-medium text-slate-100">{a.accountName}</td>
                                <td className="py-2 pr-3 text-slate-400">{subTypeLabel(a.accountSubType)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-emerald-200">{formatMoney(cur, a.inflow)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-rose-200">{formatMoney(cur, a.outflow)}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-300">
                                  {formatMoney(cur, a.transfersIn - a.transfersOut)}
                                </td>
                                <td
                                  className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                                    a.net >= 0 ? "text-emerald-300" : "text-rose-300"
                                  }`}
                                >
                                  {formatMoney(cur, a.net)}
                                </td>
                                <td className="py-2 text-right tabular-nums text-slate-300">{a.txnCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Amounts are in {cur} (home currency) · {data.accountingMethod} basis · {data.totals.transactionCount}{" "}
                        transactions · {data.start_date} to {data.end_date}
                      </p>
                    </Card>
                  </div>

                  {data.reversals.length ? (
                    <div className="mt-5">
                      <ReversalsTable pairs={data.reversals} total={data.totals.reversedAmount} currency={cur} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function HeadsTable({
  title,
  heads,
  total,
  currency,
  barClass,
  amountClass,
}: {
  title: string;
  heads: HeadSummary[];
  total: number;
  currency: string;
  barClass: string;
  amountClass: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card title={title}>
      {heads.length === 0 ? (
        <div className="py-4 text-sm text-slate-400">No entries.</div>
      ) : (
        <div className="space-y-1">
          {heads.map((h) => {
            const share = total > 0 ? h.amount / total : 0;
            const isOpen = open === h.accountId;
            return (
              <div key={h.accountId} className="rounded-xl border border-white/5 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : h.accountId)}
                  className="w-full px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-100">{h.accountName}</div>
                      <div className="text-[11px] text-slate-500">
                        {h.accountType || h.classification || "Account"} · {h.txnCount} {h.txnCount === 1 ? "entry" : "entries"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold tabular-nums ${amountClass}`}>{formatMoney(currency, h.amount)}</div>
                      <div className="text-[11px] tabular-nums text-slate-500">{(share * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(share * 100, 1)}%` }} />
                  </div>
                </button>

                {isOpen ? (
                  <div className="overflow-x-auto border-t border-white/5 px-3 pb-3">
                    <table className="mt-2 w-full min-w-[560px] text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Date</th>
                          <th className="py-1 pr-2 font-semibold">Type</th>
                          <th className="py-1 pr-2 font-semibold">Name / memo</th>
                          <th className="py-1 pr-2 font-semibold">Bank / cash</th>
                          <th className="py-1 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.transactions.map((t) => (
                          <tr key={`${t.txnType}-${t.txnId}`} className="border-t border-white/5 align-top">
                            <td className="whitespace-nowrap py-1.5 pr-2 text-slate-300">{t.date}</td>
                            <td className="whitespace-nowrap py-1.5 pr-2 text-slate-300">
                              {t.txnType}
                              {t.docNum ? <span className="text-slate-500"> #{t.docNum}</span> : null}
                            </td>
                            <td className="py-1.5 pr-2 text-slate-300">
                              {t.name || "—"}
                              {t.memo ? <div className="text-slate-500">{t.memo}</div> : null}
                            </td>
                            <td className="py-1.5 pr-2 text-slate-400">{t.cashAccounts.join(", ")}</td>
                            <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-slate-100">
                              {formatMoney(currency, t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-white/10 px-3 pt-3 text-sm font-semibold">
            <span className="text-slate-300">Total</span>
            <span className={`tabular-nums ${amountClass}`}>{formatMoney(currency, total)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReversalsTable({ pairs, total, currency }: { pairs: ReversalPair[]; total: number; currency: string }) {
  return (
    <Card title="Removed: failed payments & returned cheques">
      <p className="mb-3 text-xs text-slate-400">
        Each pair moved the same amount in and out of the same account, so it has no final effect. These entries are not
        in the inflow and outflow totals. Net cash flow does not change.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <th className="py-1.5 pr-2 font-semibold">Account head</th>
              <th className="py-1.5 pr-2 font-semibold">Bank / cash</th>
              <th className="py-1.5 pr-2 font-semibold">First entry</th>
              <th className="py-1.5 pr-2 font-semibold">Reversing entry</th>
              <th className="py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={`${p.entries[0].txnType}-${p.entries[0].txnId}-${i}`} className="border-b border-white/5 align-top">
                <td className="py-1.5 pr-2 text-slate-200">{p.accountName}</td>
                <td className="py-1.5 pr-2 text-slate-400">{p.cashAccountName}</td>
                {p.entries.map((e) => (
                  <td key={`${e.txnType}-${e.txnId}`} className="py-1.5 pr-2 text-slate-300">
                    <span className={e.direction === "in" ? "text-emerald-300" : "text-rose-300"}>
                      {e.direction === "in" ? "In" : "Out"}
                    </span>{" "}
                    {e.date} · {e.txnType}
                    {e.docNum ? <span className="text-slate-500"> #{e.docNum}</span> : null}
                    {e.name ? <div className="text-slate-500">{e.name}</div> : null}
                  </td>
                ))}
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-slate-100">{formatMoney(currency, p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm font-semibold">
        <span className="text-slate-300">{pairs.length} {pairs.length === 1 ? "pair" : "pairs"} removed</span>
        <span className="tabular-nums text-slate-100">{formatMoney(currency, total)}</span>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="premium-surface rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(3,7,18,0.76))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-100">{title}</div>
        <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 opacity-70" />
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-slate-300">{label}</div>
      <div className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
