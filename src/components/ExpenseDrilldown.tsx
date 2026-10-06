"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* ---------------- types ---------------- */

type Entry = { date: string; txnType: string; docNum: string; memo: string; amount: number };
type Item = { key: string; name: string; monthly: number[]; total: number; entryCount: number; entries: Entry[] };
type AccountBreakdown = { accountId: string; accountName: string; monthly: number[]; total: number; items: Item[] };

type BreakdownResp =
  | {
      ok: true;
      months: Array<{ key: string; label: string }>;
      monthly: number[];
      total: number;
      accounts: AccountBreakdown[];
      truncatedMonths: boolean;
    }
  | { ok: false; error: string };

type OkResp = Extract<BreakdownResp, { ok: true }>;

export type ExpenseCategory = { name: string; value: number; color: string; accountIds: string[] };

type Row = {
  key: string;
  name: string;
  monthly: number[];
  total: number;
  entryCount: number;
  children?: Row[];
  entries?: Entry[];
};

/* ---------------- formatting ---------------- */

function fmtFull(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}Rs ${Math.round(Math.abs(n)).toLocaleString("en")}`;
}

function fmtShort(n: number) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}Rs ${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}Rs ${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K`;
  return `${sign}Rs ${Math.round(a).toLocaleString("en")}`;
}

/** Change from the previous month. null = no previous month to compare. */
type Change = { kind: "up" | "down" | "flat" | "new" | "stopped"; pct: number } | null;

function changeOf(prev: number | undefined, cur: number): Change {
  if (prev === undefined) return null;
  if (prev === 0 && cur === 0) return { kind: "flat", pct: 0 };
  if (prev === 0) return { kind: "new", pct: 0 };
  if (cur === 0) return { kind: "stopped", pct: -1 };
  const pct = (cur - prev) / Math.abs(prev);
  if (Math.abs(pct) < 0.005) return { kind: "flat", pct: 0 };
  return { kind: pct > 0 ? "up" : "down", pct };
}

function changeText(c: Change) {
  if (!c) return "First month";
  if (c.kind === "new") return "New this month";
  if (c.kind === "stopped") return "No cost this month";
  if (c.kind === "flat") return "No change";
  return `${c.pct > 0 ? "+" : "−"}${Math.abs(c.pct * 100).toFixed(1)}%`;
}

/* ---------------- main ---------------- */

/**
 * The parent mounts this with a `key` of category + period, so a new
 * selection starts with fresh state.
 */
export default function ExpenseDrilldown({
  category,
  start,
  end,
  onClose,
}: {
  category: ExpenseCategory;
  start: string;
  end: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ ok: true; data: OkResp } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({
      start_date: start,
      end_date: end,
      // The Expense Composition donut is built from the Accrual P&L.
      accounting_method: "Accrual",
      accounts: category.accountIds.join(","),
    });
    fetch(`/api/qbo/expense-breakdown?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: BreakdownResp) => {
        if (cancelled) return;
        setResult(json.ok ? { ok: true, data: json } : { ok: false, error: json.error || "Breakdown failed" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [category.accountIds, start, end]);

  return (
    <div className="xd-enter mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(3,7,18,0.86))] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
      {/* colour band of the selected category */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${category.color}, transparent)` }} />

      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Expense analysis</div>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: category.color, boxShadow: `0 0 14px ${category.color}` }} />
              <h3 className="truncate text-xl font-semibold tracking-tight text-white md:text-2xl">{category.name}</h3>
            </div>
            {result?.ok ? (
              <div className="mt-1 text-xs text-slate-400">
                Month by month · {result.data.months[0]?.label} – {result.data.months[result.data.months.length - 1]?.label}
                {category.accountIds.length > 1 ? ` · ${category.accountIds.length} expense accounts` : ""}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close analysis"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {!result ? (
          <LoadingState />
        ) : !result.ok ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{result.error}</div>
        ) : (
          <Analysis data={result.data} category={category} />
        )}
      </div>

      <style jsx global>{`
        @keyframes xd-enter {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .xd-enter {
          animation: xd-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes xd-card-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .xd-card-in {
          animation: xd-card-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes xd-rise {
          0%,
          100% {
            transform: translateY(1.5px);
          }
          50% {
            transform: translateY(-2.5px);
          }
        }
        @keyframes xd-fall {
          0%,
          100% {
            transform: translateY(-1.5px);
          }
          50% {
            transform: translateY(2.5px);
          }
        }
        @keyframes xd-ping {
          0% {
            transform: scale(0.85);
            opacity: 0.55;
          }
          80%,
          100% {
            transform: scale(1.7);
            opacity: 0;
          }
        }
        @keyframes xd-breathe {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }
        @keyframes xd-twinkle {
          0%,
          100% {
            transform: rotate(0deg) scale(0.9);
          }
          50% {
            transform: rotate(18deg) scale(1.12);
          }
        }
        @keyframes xd-shimmer {
          from {
            background-position: -200% 0;
          }
          to {
            background-position: 200% 0;
          }
        }
        .xd-rise {
          animation: xd-rise 1.6s ease-in-out infinite;
        }
        .xd-fall {
          animation: xd-fall 1.6s ease-in-out infinite;
        }
        .xd-ping {
          animation: xd-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .xd-breathe {
          animation: xd-breathe 2.2s ease-in-out infinite;
        }
        .xd-twinkle {
          animation: xd-twinkle 1.8s ease-in-out infinite;
        }
        .xd-shimmer {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
          background-size: 200% 100%;
          animation: xd-shimmer 1.6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .xd-enter,
          .xd-card-in,
          .xd-rise,
          .xd-fall,
          .xd-ping,
          .xd-breathe,
          .xd-twinkle,
          .xd-shimmer {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------------- analysis body ---------------- */

function Analysis({ data, category }: { data: OkResp; category: ExpenseCategory }) {
  const { months, monthly, total } = data;
  const n = months.length;
  const avg = n > 0 ? total / n : 0;
  const changes = monthly.map((v, i) => changeOf(i > 0 ? monthly[i - 1] : undefined, v));
  const maxMonth = monthly.reduce((best, v, i) => (v > monthly[best] ? i : best), 0);

  const firstIdx = monthly.findIndex((v) => v !== 0);
  const overall = n > 1 && firstIdx >= 0 && firstIdx < n - 1 ? changeOf(monthly[firstIdx], monthly[n - 1]) : null;

  const rows: Row[] = useMemo(() => {
    const toRow = (it: Item): Row => ({ ...it, entries: it.entries });
    if (data.accounts.length === 1) return data.accounts[0].items.map(toRow);
    return data.accounts.map((a) => ({
      key: a.accountId,
      name: a.accountName,
      monthly: a.monthly,
      total: a.total,
      entryCount: a.items.reduce((s, it) => s + it.entryCount, 0),
      children: a.items.map(toRow),
    }));
  }, [data.accounts]);

  if (total === 0 && rows.length === 0) {
    return <div className="mt-6 text-sm text-slate-400">No entries were found for this category in the selected months.</div>;
  }

  const rowsLabel = data.accounts.length === 1 ? "Payee / vendor" : "Expense account";

  return (
    <div className="mt-5 space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total in period" value={fmtShort(total)} sub={fmtFull(total)} delay={0} />
        <Kpi label="Monthly average" value={fmtShort(avg)} sub={`${n} month${n === 1 ? "" : "s"}`} delay={60} />
        <Kpi label="Highest month" value={fmtShort(monthly[maxMonth] ?? 0)} sub={months[maxMonth]?.label ?? ""} delay={120} />
        <div className="xd-card-in rounded-2xl border border-white/10 bg-white/[0.04] p-4" style={{ animationDelay: "180ms" }}>
          <div className="text-[11px] font-medium text-slate-400">Overall trend</div>
          <div className="mt-2 flex items-center gap-2.5">
            <TrendIcon change={overall} size="lg" />
            <div className="text-lg font-semibold tabular-nums text-white">{overall ? changeText(overall) : "—"}</div>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {overall && firstIdx >= 0 ? `${months[firstIdx].label} → ${months[n - 1].label}` : "Needs two months"}
          </div>
        </div>
      </div>

      {/* Month strip with month-on-month change */}
      <div>
        <SectionLabel>Month on month</SectionLabel>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {months.map((m, i) => {
            const c = changes[i];
            const share = monthly[maxMonth] > 0 ? Math.max(monthly[i] / monthly[maxMonth], 0) : 0;
            return (
              <div
                key={m.key}
                className="xd-card-in min-w-[132px] flex-1 rounded-2xl border border-white/10 bg-white/[0.035] p-3.5"
                style={{ animationDelay: `${Math.min(i * 45, 600)}ms` }}
              >
                <div className="text-[11px] font-medium text-slate-400">{m.label}</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-white" title={fmtFull(monthly[i])}>
                  {fmtShort(monthly[i])}
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: category.color }} />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <TrendIcon change={c} />
                  <span className={`text-xs font-semibold tabular-nums ${toneText(c)}`}>{changeText(c)}</span>
                </div>
                {c && i > 0 && (c.kind === "up" || c.kind === "down") ? (
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    {c.kind === "up" ? "more" : "less"} than {months[i - 1].label.split(" ")[0]}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Monthly cost</SectionLabel>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-block h-0 w-5 border-t border-dashed border-slate-400" />
            Average {fmtShort(avg)}
          </div>
        </div>
        <div className="mt-3 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months.map((m, i) => ({ label: m.label, value: monthly[i], idx: i }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="xd-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={category.color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={category.color} stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => fmtShort(v).replace("Rs ", "")}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<BarTip changes={changes} months={months} />} />
              <ReferenceLine y={avg} stroke="rgba(148,163,184,0.7)" strokeDasharray="4 4" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={46} animationDuration={900}>
                {months.map((m, i) => (
                  <Cell key={m.key} fill="url(#xd-bar)" stroke={i === maxMonth ? category.color : "none"} strokeWidth={i === maxMonth ? 1.5 : 0} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail matrix */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionLabel>What makes up this cost</SectionLabel>
          <span className="text-[11px] text-slate-500">Darker cell = higher amount · click a row for details</span>
        </div>
        <DetailMatrix rows={rows} months={months} total={total} monthly={monthly} color={category.color} rowsLabel={rowsLabel} />
        {data.truncatedMonths ? (
          <div className="mt-2 text-[11px] text-amber-300/80">Only the first 36 months of the range are shown.</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- matrix ---------------- */

function DetailMatrix({
  rows,
  months,
  total,
  monthly,
  color,
  rowsLabel,
}: {
  rows: Row[];
  months: Array<{ key: string; label: string }>;
  total: number;
  monthly: number[];
  color: string;
  rowsLabel: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const max = Math.max(1, ...rows.flatMap((r) => r.monthly));
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const renderRow = (r: Row, depth: number, parentKey: string): React.ReactNode => {
    const k = `${parentKey}/${r.key}`;
    const isOpen = !!open[k];
    const expandable = (r.children && r.children.length > 0) || (r.entries && r.entries.length > 0);
    const rowMax = depth === 0 ? max : Math.max(1, ...r.monthly);
    return (
      <React.Fragment key={k}>
        <tr
          className={`group border-t border-white/5 ${expandable ? "cursor-pointer" : ""} ${depth > 0 ? "bg-white/[0.015]" : ""} hover:bg-white/[0.04]`}
          onClick={expandable ? () => toggle(k) : undefined}
        >
          <td className="sticky left-0 z-10 bg-[#0a1120] py-2.5 pl-3 pr-3 group-hover:bg-[#0e1628]">
            <div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
              {expandable ? (
                <svg className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                </svg>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <div className="min-w-0">
                <div className={`max-w-[220px] truncate ${depth === 0 ? "font-medium text-slate-100" : "text-slate-300"}`} title={r.name}>
                  {r.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  {r.entryCount} entr{r.entryCount === 1 ? "y" : "ies"}
                </div>
              </div>
            </div>
          </td>
          {r.monthly.map((v, i) => {
            const c = changeOf(i > 0 ? r.monthly[i - 1] : undefined, v);
            const alpha = v > 0 ? 0.08 + 0.5 * Math.min(v / rowMax, 1) : 0;
            return (
              <td key={months[i].key} className="px-1 py-1.5 text-right">
                <div
                  className="rounded-lg px-2 py-1.5"
                  style={{ background: alpha ? hexAlpha(color, alpha) : "transparent" }}
                  title={`${months[i].label}: ${fmtFull(v)}${c ? ` · ${changeText(c)}` : ""}`}
                >
                  <div className={`whitespace-nowrap tabular-nums ${v === 0 ? "text-slate-600" : "text-slate-100"}`}>{v === 0 ? "—" : fmtShort(v)}</div>
                  {c && (c.kind === "up" || c.kind === "down") ? (
                    <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-[10px] tabular-nums ${toneText(c)}`}>
                      <Arrow up={c.kind === "up"} className="h-2.5 w-2.5" />
                      {Math.abs(c.pct * 100).toFixed(0)}%
                    </div>
                  ) : null}
                </div>
              </td>
            );
          })}
          <td className="py-2.5 pl-3 pr-2 text-right font-semibold tabular-nums text-white">{fmtShort(r.total)}</td>
          <td className="py-2.5 pl-2 pr-3 text-right tabular-nums text-slate-400">{total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : "—"}</td>
        </tr>

        {isOpen && r.children ? r.children.map((ch) => renderRow(ch, depth + 1, k)) : null}

        {isOpen && r.entries && r.entries.length > 0 ? (
          <tr className="border-t border-white/5 bg-black/25">
            <td colSpan={months.length + 3} className="px-3 py-3">
              <EntriesTable entries={r.entries} more={r.entryCount - r.entries.length} />
            </td>
          </tr>
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[640px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <th className="sticky left-0 z-10 bg-[#0a1120] py-2.5 pl-3 pr-3 text-left font-semibold">{rowsLabel}</th>
            {months.map((m) => (
              <th key={m.key} className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">
                {m.label}
              </th>
            ))}
            <th className="py-2.5 pl-3 pr-2 text-right font-semibold">Total</th>
            <th className="py-2.5 pl-2 pr-3 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => renderRow(r, 0, ""))}
          <tr className="border-t border-white/15 bg-white/[0.03] text-sm">
            <td className="sticky left-0 z-10 bg-[#0d1527] py-3 pl-3 pr-3 font-semibold text-white">Total</td>
            {monthly.map((v, i) => {
              const c = changeOf(i > 0 ? monthly[i - 1] : undefined, v);
              return (
                <td key={months[i].key} className="px-2 py-3 text-right">
                  <div className="whitespace-nowrap font-semibold tabular-nums text-white">{fmtShort(v)}</div>
                  {c && (c.kind === "up" || c.kind === "down") ? (
                    <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-[10px] tabular-nums ${toneText(c)}`}>
                      <Arrow up={c.kind === "up"} className="h-2.5 w-2.5" />
                      {Math.abs(c.pct * 100).toFixed(1)}%
                    </div>
                  ) : null}
                </td>
              );
            })}
            <td className="py-3 pl-3 pr-2 text-right font-semibold tabular-nums text-white">{fmtShort(total)}</td>
            <td className="py-3 pl-2 pr-3 text-right tabular-nums text-slate-400">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EntriesTable({ entries, more }: { entries: Entry[]; more: number }) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <th className="py-1 pr-3 font-semibold">Date</th>
            <th className="py-1 pr-3 font-semibold">Type</th>
            <th className="py-1 pr-3 font-semibold">Memo</th>
            <th className="py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-t border-white/5 align-top">
              <td className="whitespace-nowrap py-1.5 pr-3 text-slate-300">{e.date}</td>
              <td className="whitespace-nowrap py-1.5 pr-3 text-slate-300">
                {e.txnType}
                {e.docNum ? <span className="text-slate-500"> #{e.docNum}</span> : null}
              </td>
              <td className="py-1.5 pr-3 text-slate-400">{e.memo || "—"}</td>
              <td className={`whitespace-nowrap py-1.5 text-right tabular-nums ${e.amount < 0 ? "text-emerald-300" : "text-slate-100"}`}>{fmtFull(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more > 0 ? <div className="mt-2 text-[10px] text-slate-500">{more} older entries not shown.</div> : null}
    </div>
  );
}

/* ---------------- small parts ---------------- */

/** Spending going up is shown in rose, going down in emerald. */
function toneText(c: Change) {
  if (!c) return "text-slate-500";
  if (c.kind === "up") return "text-rose-300";
  if (c.kind === "down" || c.kind === "stopped") return "text-emerald-300";
  if (c.kind === "new") return "text-amber-300";
  return "text-slate-400";
}

function TrendIcon({ change, size = "md" }: { change: Change; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  const icon = size === "lg" ? "h-4.5 w-4.5" : "h-3.5 w-3.5";

  if (!change) {
    return (
      <span className={`relative grid ${box} shrink-0 place-items-center rounded-full bg-white/[0.06] text-slate-500`} aria-label="First month">
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
    );
  }

  const k = change.kind;
  const ring = k === "up" ? "bg-rose-400/25" : k === "down" || k === "stopped" ? "bg-emerald-400/25" : k === "new" ? "bg-amber-300/25" : "";
  const bg = k === "up" ? "bg-rose-500/15 text-rose-300" : k === "down" || k === "stopped" ? "bg-emerald-500/15 text-emerald-300" : k === "new" ? "bg-amber-400/15 text-amber-200" : "bg-white/[0.06] text-slate-400";

  return (
    <span className={`relative grid ${box} shrink-0 place-items-center rounded-full ${bg}`} aria-label={changeText(change)}>
      {ring ? <span className={`xd-ping absolute inset-0 rounded-full ${ring}`} aria-hidden /> : null}
      {k === "up" || k === "down" || k === "stopped" ? (
        <span className={k === "up" ? "xd-rise" : "xd-fall"}>
          <Arrow up={k === "up"} className={icon} />
        </span>
      ) : k === "new" ? (
        <svg className={`xd-twinkle ${icon}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" />
        </svg>
      ) : (
        <svg className={`xd-breathe ${icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" d="M6 12h12" />
        </svg>
      )}
    </span>
  );
}

function Arrow({ up, className }: { up: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} aria-hidden>
      {up ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />
      )}
    </svg>
  );
}

function BarTip({
  active,
  payload,
  changes,
  months,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number; idx: number } }>;
  changes: Change[];
  months: Array<{ key: string; label: string }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const c = changes[p.idx];
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1424]/95 px-3 py-2.5 text-xs shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="font-semibold text-white">{p.label}</div>
      <div className="mt-1 tabular-nums text-slate-200">{fmtFull(p.value)}</div>
      <div className={`mt-1 flex items-center gap-1 ${toneText(c)}`}>
        {c && (c.kind === "up" || c.kind === "down") ? <Arrow up={c.kind === "up"} className="h-3 w-3" /> : null}
        {changeText(c)}
        {c && p.idx > 0 && (c.kind === "up" || c.kind === "down") ? <span className="text-slate-500">vs {months[p.idx - 1].label}</span> : null}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, delay }: { label: string; value: string; sub: string; delay: number }) {
  return (
    <div className="xd-card-in rounded-2xl border border-white/10 bg-white/[0.04] p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-1 truncate text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{children}</div>;
}

function LoadingState() {
  return (
    <div className="mt-5 space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="xd-shimmer h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="xd-shimmer h-[120px] rounded-2xl" />
      <div className="xd-shimmer h-[280px] rounded-2xl" />
      <div className="text-xs text-slate-500">Reading entries from QuickBooks…</div>
    </div>
  );
}

function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(148,163,184,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
