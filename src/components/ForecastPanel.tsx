"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  METHOD_LABEL,
  SEASONAL_MIN_MONTHS,
  MIN_BASE_MONTHS,
  buildForecast,
  currencySymbol,
  fmtMoney,
  fmtPct,
  fmtSignedPct,
  monthLabel,
  type ForecastOptions,
  type ForecastResult,
  type HistoryMonth,
  type Insight,
  type Method,
  type Scenario,
} from "@/lib/forecast";
import { conversionFactor } from "@/lib/currency";
import { CurrencyFields, RateNote, type CurrencyFilterState } from "@/components/CurrencyFilter";

/* ---------------- API shape (/api/forecast) ---------------- */

export type ForecastHistoryResp = {
  ok: boolean;
  currency: string;
  accounting_method: "Accrual" | "Cash";
  period: { start: string; end: string; months: number };
  excludedPartialMonth: string | null;
  history: HistoryMonth[];
  cash: { balance: number; asOf: string } | null;
  error?: string;
};

/* ---------------- colours (validated for colour-blind separation on the dark surface) ---------------- */

const C = {
  revenue: "#3987e5",
  costs: "#d95926",
  profit: "#27a37c",
  grid: "rgba(255,255,255,0.08)",
  axis: "rgba(255,255,255,0.5)",
};

const TONE = {
  good: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  watch: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  risk: "border-rose-400/25 bg-rose-500/10 text-rose-200",
  info: "border-sky-400/25 bg-sky-500/10 text-sky-200",
} as const;
const TONE_ICON = { good: "✓", watch: "!", risk: "✕", info: "i" } as const;

/* ---------------- filter options ---------------- */

export const BASE_PERIOD_OPTIONS = [6, 12, 18, 24, 36] as const;
const HORIZON_OPTIONS = [3, 6, 12, 18, 24] as const;
const CHANGE_OPTIONS = [-0.3, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3] as const;
const METHOD_OPTIONS: Array<{ v: Method; label: string }> = [
  { v: "auto", label: "Auto (most accurate)" },
  { v: "trend", label: METHOD_LABEL.trend },
  { v: "growth", label: METHOD_LABEL.growth },
  { v: "average", label: METHOD_LABEL.average },
];
const SCENARIO_LABEL: Record<Scenario, string> = { pessimistic: "Pessimistic", base: "Base", optimistic: "Optimistic" };

const DEFAULTS: ForecastOptions = {
  horizon: 12,
  method: "auto",
  seasonality: true,
  scenario: "base",
  revenueChangePct: 0,
  opexChangePct: 0,
};

/* ---------------- main ---------------- */

export default function ForecastPanel({
  data,
  loading,
  baseMonths,
  onBaseMonthsChange,
  currencyFilter,
}: {
  data: ForecastHistoryResp | null;
  loading: boolean;
  baseMonths: number;
  onBaseMonthsChange: (months: number) => void;
  /** Shared with the other modules, so the currency stays the same on all tabs. */
  currencyFilter: CurrencyFilterState;
}) {
  const [opts, setOpts] = useState<ForecastOptions>(DEFAULTS);
  const set = <K extends keyof ForecastOptions>(k: K, v: ForecastOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  // Currency: amounts come in the QuickBooks home currency and are converted at one market rate.
  const homeCurrency = data?.currency ?? "PKR";
  const { display: displayCurrency, pkrPerUsd } = currencyFilter;
  const factor = conversionFactor(homeCurrency, displayCurrency, pkrPerUsd);
  const currency = factor != null ? displayCurrency : homeCurrency;
  const otherCurrency = currency === "USD" ? "PKR" : "USD";
  const otherFactor = conversionFactor(currency, otherCurrency, pkrPerUsd);

  const history = useMemo(() => {
    const rows = data?.history ?? [];
    if (factor == null || factor === 1) return rows;
    return rows.map((h) => ({
      month: h.month,
      revenue: h.revenue * factor,
      cogs: h.cogs * factor,
      opex: h.opex * factor,
      otherIncome: h.otherIncome * factor,
      otherExpenses: h.otherExpenses * factor,
      netProfit: h.netProfit * factor,
    }));
  }, [data?.history, factor]);
  const openingCash = data?.cash ? data.cash.balance * (factor ?? 1) : null;
  const seasonalityAvailable = history.length >= SEASONAL_MIN_MONTHS;
  const effectiveOpts = useMemo(() => ({ ...opts, seasonality: opts.seasonality && seasonalityAvailable }), [opts, seasonalityAvailable]);

  const result = useMemo(
    () => buildForecast(history, openingCash, effectiveOpts, currency),
    [history, openingCash, effectiveOpts, currency]
  );
  const scenarios = useMemo(
    () =>
      (["pessimistic", "base", "optimistic"] as const).map((s) => ({
        scenario: s,
        r: buildForecast(history, openingCash, { ...effectiveOpts, scenario: s }, currency),
      })),
    [history, openingCash, effectiveOpts, currency]
  );

  const isDefault = JSON.stringify(opts) === JSON.stringify(DEFAULTS);
  const money = (n: number) => fmtMoney(n, currency);
  // Large amounts (PKR) show in thousands; small amounts (USD) show in full.
  const tableScale = result && Math.max(...result.months.map((m) => m.revenue), result.actualAverage.revenue) >= 1_000_000 ? 1000 : 1;
  const otherMoney = otherFactor != null ? (n: number) => `≈ ${fmtMoney(n * otherFactor, otherCurrency)}` : undefined;

  return (
    <div className="mt-6 space-y-5">
      {/* Filters */}
      <Card title="Forecast options" hint="The forecast updates when you change an option">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <CurrencyFields state={currencyFilter} />
          <Select
            label="Base period"
            value={baseMonths}
            onChange={(v) => onBaseMonthsChange(Number(v))}
            options={BASE_PERIOD_OPTIONS.map((m) => ({ v: m, label: `Last ${m} months` }))}
          />
          <Select
            label="Forecast period"
            value={opts.horizon}
            onChange={(v) => set("horizon", Number(v))}
            options={HORIZON_OPTIONS.map((m) => ({ v: m, label: `Next ${m} months` }))}
          />
          <Select label="Method" value={opts.method} onChange={(v) => set("method", v as Method)} options={METHOD_OPTIONS} />
          <Select
            label="Seasonality"
            value={effectiveOpts.seasonality ? "on" : "off"}
            onChange={(v) => set("seasonality", v === "on")}
            disabled={!seasonalityAvailable}
            title={seasonalityAvailable ? undefined : `Needs a base period of ${SEASONAL_MIN_MONTHS} months or more`}
            options={[
              { v: "on", label: "On" },
              { v: "off", label: seasonalityAvailable ? "Off" : `Off (needs ${SEASONAL_MIN_MONTHS}+ mo)` },
            ]}
          />
          <Select
            label="Scenario"
            value={opts.scenario}
            onChange={(v) => set("scenario", v as Scenario)}
            options={(["pessimistic", "base", "optimistic"] as const).map((s) => ({ v: s, label: SCENARIO_LABEL[s] }))}
          />
          <Select
            label="Revenue change"
            value={opts.revenueChangePct}
            onChange={(v) => set("revenueChangePct", Number(v))}
            options={CHANGE_OPTIONS.map((p) => ({ v: p, label: p === 0 ? "No change" : fmtSignedPct(p, 0) }))}
          />
          <Select
            label="Expense change"
            value={opts.opexChangePct}
            onChange={(v) => set("opexChangePct", Number(v))}
            options={CHANGE_OPTIONS.map((p) => ({ v: p, label: p === 0 ? "No change" : fmtSignedPct(p, 0) }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {data?.ok
              ? `Base period: ${monthLabel(data.period.start)} – ${monthLabel(data.period.end)} (${data.history.length} complete months) · ${data.accounting_method} basis${
                  data.excludedPartialMonth ? ` · ${monthLabel(data.excludedPartialMonth)} is not included because it is not complete` : ""
                }`
              : "The base period ends with the “To” month of the date filter above."}
            <span className="block">
              <RateNote state={currencyFilter} home={homeCurrency} converted={factor != null && factor !== 1} />
            </span>
          </span>
          {!isDefault ? (
            <button onClick={() => setOpts(DEFAULTS)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/10">
              Reset options
            </button>
          ) : null}
        </div>
      </Card>

      {loading && !result ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : !data?.ok ? (
        <Empty text={data?.error ?? "No forecast data. Select Apply to load the data."} />
      ) : !result ? (
        <Empty text={`The forecast needs at least ${MIN_BASE_MONTHS} complete months. Select a longer base period.`} />
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Kpis r={result} money={money} otherMoney={otherMoney} horizon={opts.horizon} />

          <Card
            title="Revenue, costs and net profit"
            hint={`Actual months, then the ${SCENARIO_LABEL[opts.scenario].toLowerCase()} forecast (dashed). The shaded area is the 80% range of revenue.`}
          >
            <MainChart history={history} r={result} currency={currency} />
          </Card>

          <Card
            title="Forecast profit & loss statement"
            hint={`Amounts in ${currencySymbol(currency)}${tableScale === 1000 ? " thousands" : ""} · costs and losses in brackets`}
          >
            <PnlTable r={result} scale={tableScale} />
          </Card>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card title="Scenario comparison" hint={`Total for the next ${opts.horizon} months`}>
              <ScenarioTable rows={scenarios} active={opts.scenario} money={money} />
            </Card>
            <Card
              title="Cash projection"
              hint={data.cash ? `Opening cash: bank balance on ${data.cash.asOf}` : "Bank balance is not available"}
            >
              {data.cash ? <CashChart r={result} currency={currency} /> : <Empty text="The bank balance could not be read from QuickBooks." />}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <Card title="What this means" className="xl:col-span-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {result.insights.map((it, i) => (
                  <InsightCard key={i} insight={it} />
                ))}
              </div>
            </Card>
            <Card title="Method and assumptions" className="xl:col-span-2">
              <Assumptions r={result} opts={effectiveOpts} data={data} money={money} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- KPIs ---------------- */

function Kpis({
  r,
  money,
  otherMoney,
  horizon,
}: {
  r: ForecastResult;
  money: (n: number) => string;
  otherMoney?: (n: number) => string;
  horizon: number;
}) {
  const be = r.breakEven;
  const acc = r.assumptions.revenue.accuracy;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi
        label="Forecast revenue"
        value={money(r.totals.revenue)}
        alt={otherMoney?.(r.totals.revenue)}
        tone={r.revenueChangeVsActual == null ? undefined : r.revenueChangeVsActual >= 0 ? "good" : "risk"}
        note={`${money(r.totals.revenue / horizon)} a month · ${fmtSignedPct(r.revenueChangeVsActual)} vs last ${r.actualAverage.months} months`}
      />
      <Kpi
        label="Forecast net profit"
        value={money(r.totals.netProfit)}
        alt={otherMoney?.(r.totals.netProfit)}
        tone={r.totals.netProfit >= 0 ? "good" : "risk"}
        note={`Net margin ${fmtPct(r.totals.netMargin)} · ${r.lossMonths} loss month${r.lossMonths === 1 ? "" : "s"}`}
      />
      <Kpi
        label="Break-even revenue"
        value={be.monthlyRevenue != null ? `${money(be.monthlyRevenue)}/mo` : "—"}
        alt={be.monthlyRevenue != null ? otherMoney?.(be.monthlyRevenue) : undefined}
        tone={be.marginOfSafety == null ? undefined : be.marginOfSafety >= 0.1 ? "good" : be.marginOfSafety >= 0 ? "watch" : "risk"}
        note={be.marginOfSafety != null ? `Margin of safety ${fmtPct(be.marginOfSafety)}` : "Cost of sales is higher than revenue"}
      />
      <Kpi
        label="Closing cash"
        value={r.cash.closing != null ? money(r.cash.closing) : "—"}
        alt={r.cash.closing != null ? otherMoney?.(r.cash.closing) : undefined}
        tone={r.cash.closing == null ? undefined : r.cash.runOutMonth ? "risk" : r.cash.opening != null && r.cash.closing < r.cash.opening ? "watch" : "good"}
        note={
          r.cash.opening == null
            ? "Bank balance not available"
            : r.cash.runOutMonth
              ? `Runs out in ${monthLabel(r.cash.runOutMonth)}`
              : `Opening ${money(r.cash.opening)}`
        }
      />
      <Kpi
        label="Forecast accuracy"
        value={acc != null ? fmtPct(acc, 0) : "—"}
        tone={acc == null ? undefined : acc >= 0.85 ? "good" : acc >= 0.7 ? "watch" : "risk"}
        note={`Revenue · ${METHOD_LABEL[r.assumptions.revenue.method]}`}
      />
    </div>
  );
}

/* ---------------- main chart ---------------- */

type ChartPoint = {
  month: string;
  actualRevenue?: number;
  actualCosts?: number;
  forecastRevenue?: number;
  forecastCosts?: number;
  range?: [number, number];
  netProfit: number;
  isForecast: boolean;
};

function MainChart({ history, r, currency }: { history: HistoryMonth[]; r: ForecastResult; currency: string }) {
  const points: ChartPoint[] = useMemo(() => {
    const actual: ChartPoint[] = history.map((h) => ({
      month: monthLabel(h.month),
      actualRevenue: h.revenue,
      actualCosts: h.cogs + h.opex,
      netProfit: h.netProfit,
      isForecast: false,
    }));
    // The last actual month also starts the forecast lines, so the lines join.
    const last = actual[actual.length - 1];
    if (last) {
      last.forecastRevenue = last.actualRevenue;
      last.forecastCosts = last.actualCosts;
      last.range = [last.actualRevenue ?? 0, last.actualRevenue ?? 0];
    }
    const fc: ChartPoint[] = r.months.map((m) => ({
      month: monthLabel(m.month),
      forecastRevenue: m.revenue,
      forecastCosts: m.cogs + m.opex,
      range: [m.revenueLow, m.revenueHigh],
      netProfit: m.netProfit,
      isForecast: true,
    }));
    return [...actual, ...fc];
  }, [history, r.months]);

  const divider = monthLabel(history[history.length - 1]?.month ?? "");

  return (
    <>
      <Legend
        items={[
          { label: "Revenue", color: C.revenue, kind: "line" },
          { label: "Total costs (cost of sales + operating expenses)", color: C.costs, kind: "line" },
          { label: "Net profit", color: C.profit, kind: "bar" },
        ]}
      />
      <div className="h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={axisFmt} width={56} />
            <Tooltip cursor={{ stroke: "rgba(255,255,255,0.25)" }} content={<ChartTooltip currency={currency} />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
            <ReferenceLine
              x={divider}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="4 4"
              label={{ value: "Forecast →", fill: "rgba(255,255,255,0.55)", fontSize: 11, position: "insideTopRight" }}
            />
            <Area dataKey="range" stroke="none" fill={C.revenue} fillOpacity={0.15} isAnimationActive={false} name="Revenue range (80%)" />
            <Bar dataKey="netProfit" name="Net profit" fill={C.profit} radius={[4, 4, 4, 4]} maxBarSize={18} fillOpacity={0.85} />
            <Line dataKey="actualRevenue" name="Revenue" stroke={C.revenue} strokeWidth={2} dot={false} connectNulls={false} />
            <Line dataKey="actualCosts" name="Total costs" stroke={C.costs} strokeWidth={2} dot={false} connectNulls={false} />
            <Line dataKey="forecastRevenue" name="Revenue (forecast)" stroke={C.revenue} strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line dataKey="forecastCosts" name="Total costs (forecast)" stroke={C.costs} strokeWidth={2} strokeDasharray="6 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const revenue = p.isForecast ? p.forecastRevenue : p.actualRevenue;
  const costs = p.isForecast ? p.forecastCosts : p.actualCosts;
  const rows: Array<[string, string, string]> = [
    ["Revenue", fmtMoney(revenue ?? 0, currency), C.revenue],
    ["Total costs", fmtMoney(costs ?? 0, currency), C.costs],
    ["Net profit", fmtMoney(p.netProfit, currency), C.profit],
  ];
  if (p.isForecast && p.range) rows.push(["Revenue range", `${fmtMoney(p.range[0], currency)} – ${fmtMoney(p.range[1], currency)}`, "transparent"]);
  return (
    <div className="rounded-xl border border-white/10 bg-[#070b1a]/95 px-3 py-2 text-xs text-slate-100 shadow-xl">
      <div className="mb-1 font-semibold">
        {label} <span className="font-normal text-slate-400">{p.isForecast ? "· forecast" : "· actual"}</span>
      </div>
      {rows.map(([k, v, color]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {k}
          </span>
          <span className="font-semibold tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- cash chart ---------------- */

function CashChart({ r, currency }: { r: ForecastResult; currency: string }) {
  const points = [
    { month: "Opening", cash: r.cash.opening ?? 0 },
    ...r.months.map((m) => ({ month: monthLabel(m.month), cash: m.closingCash ?? 0 })),
  ];
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={axisFmt} width={56} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.25)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-white/10 bg-[#070b1a]/95 px-3 py-2 text-xs text-slate-100 shadow-xl">
                  <div className="font-semibold">{label}</div>
                  <div className="tabular-nums">Closing cash {fmtMoney(Number(payload[0].value ?? 0), currency)}</div>
                </div>
              ) : null
            }
          />
          <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" label={{ value: "No cash", fill: "#fca5a5", fontSize: 10, position: "insideBottomRight" }} />
          <Line dataKey="cash" name="Closing cash" stroke={C.revenue} strokeWidth={2} dot={{ r: 3, fill: C.revenue, strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- P&L statement ---------------- */

function PnlTable({ r, scale }: { r: ForecastResult; scale: number }) {
  const k = (n: number) => {
    const v = Math.round(Math.abs(n) / scale).toLocaleString("en");
    return n < 0 && v !== "0" ? `(${v})` : v;
  };
  const pct = (n: number | null) => (n == null ? "—" : fmtPct(n));
  const act = r.actualAverage;
  const t = r.totals;
  const gm = (rev: number, gp: number) => (rev > 0 ? gp / rev : null);

  type Line = { label: string; actual: string; cells: string[]; total: string; strong?: boolean; muted?: boolean };
  const lines: Line[] = [
    { label: "Revenue", actual: k(act.revenue), cells: r.months.map((m) => k(m.revenue)), total: k(t.revenue), strong: true },
    { label: "Cost of sales", actual: k(-act.cogs), cells: r.months.map((m) => k(-m.cogs)), total: k(-t.cogs) },
    { label: "Gross profit", actual: k(act.grossProfit), cells: r.months.map((m) => k(m.grossProfit)), total: k(t.grossProfit), strong: true },
    {
      label: "Gross margin",
      actual: pct(gm(act.revenue, act.grossProfit)),
      cells: r.months.map((m) => pct(gm(m.revenue, m.grossProfit))),
      total: pct(gm(t.revenue, t.grossProfit)),
      muted: true,
    },
    { label: "Operating expenses", actual: k(-act.opex), cells: r.months.map((m) => k(-m.opex)), total: k(-t.opex) },
    { label: "Operating profit", actual: k(act.operatingProfit), cells: r.months.map((m) => k(m.operatingProfit)), total: k(t.operatingProfit), strong: true },
    { label: "Other income / (expenses)", actual: k(act.otherNet), cells: r.months.map((m) => k(m.otherNet)), total: k(t.otherNet) },
    { label: "Net profit", actual: k(act.netProfit), cells: r.months.map((m) => k(m.netProfit)), total: k(t.netProfit), strong: true },
    {
      label: "Net margin",
      actual: pct(act.revenue > 0 ? act.netProfit / act.revenue : null),
      cells: r.months.map((m) => pct(m.netMargin)),
      total: pct(t.netMargin),
      muted: true,
    },
  ];
  if (r.cash.opening != null) {
    lines.push({
      label: "Closing cash",
      actual: k(r.cash.opening),
      cells: r.months.map((m) => k(m.closingCash ?? 0)),
      total: k(r.cash.closing ?? 0),
      strong: true,
    });
  }

  const thBase = "whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400";
  const th = `${thBase} text-right`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm tabular-nums">
        <thead>
          <tr className="border-b border-white/10">
            <th className={`${thBase} sticky left-0 bg-[#0d1424] text-left`}>Line</th>
            <th className={`${th} bg-white/[0.03]`} title={`Actual monthly average of the last ${act.months} months`}>
              Actual avg/mo
            </th>
            {r.months.map((m) => (
              <th key={m.month} className={th}>
                {monthLabel(m.month)}
              </th>
            ))}
            <th className={`${th} text-slate-200`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr
              key={l.label}
              className={`border-b border-white/5 ${l.strong ? "font-semibold text-slate-100" : l.muted ? "text-xs text-slate-400" : "text-slate-300"} ${
                l.label === "Net profit" || l.label === "Closing cash" ? "border-t border-white/15" : ""
              }`}
            >
              <td className="sticky left-0 whitespace-nowrap bg-[#0d1424] px-3 py-2 text-left">{l.label}</td>
              <td className="whitespace-nowrap bg-white/[0.03] px-3 py-2 text-right">{l.actual}</td>
              {l.cells.map((c, i) => (
                <td key={i} className={`whitespace-nowrap px-3 py-2 text-right ${c.startsWith("(") && l.strong ? "text-rose-300" : ""}`}>
                  {c}
                </td>
              ))}
              <td className={`whitespace-nowrap px-3 py-2 text-right ${l.total.startsWith("(") && l.strong ? "text-rose-300" : ""}`}>
                {l.label === "Closing cash" ? `${l.total} (end)` : l.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- scenarios ---------------- */

function ScenarioTable({
  rows,
  active,
  money,
}: {
  rows: Array<{ scenario: Scenario; r: ForecastResult | null }>;
  active: Scenario;
  money: (n: number) => string;
}) {
  const hasCash = rows.some((x) => x.r?.cash.closing != null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.08em] text-slate-400">
            <th className="py-2 pr-3 text-left">Scenario</th>
            <th className="py-2 pr-3 text-right">Revenue</th>
            <th className="py-2 pr-3 text-right">Net profit</th>
            <th className="py-2 pr-3 text-right">Margin</th>
            {hasCash ? <th className="py-2 text-right">Closing cash</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ scenario, r }) =>
            r ? (
              <tr key={scenario} className={`border-b border-white/5 ${scenario === active ? "bg-white/[0.06] font-semibold text-white" : "text-slate-300"}`}>
                <td className="py-2 pr-3">
                  {SCENARIO_LABEL[scenario]}
                  {scenario === active ? <span className="ml-2 text-[10px] font-normal text-sky-300">selected</span> : null}
                </td>
                <td className="py-2 pr-3 text-right">{money(r.totals.revenue)}</td>
                <td className={`py-2 pr-3 text-right ${r.totals.netProfit < 0 ? "text-rose-300" : ""}`}>{money(r.totals.netProfit)}</td>
                <td className="py-2 pr-3 text-right">{fmtPct(r.totals.netMargin)}</td>
                {hasCash ? (
                  <td className={`py-2 text-right ${(r.cash.closing ?? 0) < 0 ? "text-rose-300" : ""}`}>{r.cash.closing != null ? money(r.cash.closing) : "—"}</td>
                ) : null}
              </tr>
            ) : null
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Pessimistic uses the low end of the 80% range for revenue and the high end for expenses. Optimistic uses the opposite. The range comes from how
        much each line changed from month to month in the base period.
      </p>
    </div>
  );
}

/* ---------------- assumptions ---------------- */

function Assumptions({
  r,
  opts,
  data,
  money,
}: {
  r: ForecastResult;
  opts: ForecastOptions;
  data: ForecastHistoryResp;
  money: (n: number) => string;
}) {
  const a = r.assumptions;
  const line = (m: ForecastResult["assumptions"]["revenue"]) =>
    `${METHOD_LABEL[m.method]}, ${fmtSignedPct(m.monthlyGrowth)} a month${m.seasonal ? ", with seasonality" : ""}${
      m.accuracy != null ? ` · test accuracy ${fmtPct(m.accuracy, 0)}` : ""
    }`;
  const items: Array<[string, string]> = [
    ["Base period", `${monthLabel(a.firstMonth)} – ${monthLabel(a.lastMonth)} (${a.baseMonths} complete months, ${data.accounting_method} basis)`],
    ["Revenue", line(a.revenue)],
    ["Cost of sales", `${fmtPct(a.cogsRatio)} of revenue (variable cost, ratio of the base period)`],
    ["Operating expenses", line(a.opex)],
    ["Other income / (expenses)", `${money(a.otherNetAvg)} a month (average of the base period)`],
    ["Scenario", SCENARIO_LABEL[opts.scenario]],
    [
      "What-if change",
      opts.revenueChangePct || opts.opexChangePct
        ? `Revenue ${fmtSignedPct(opts.revenueChangePct, 0)}, operating expenses ${fmtSignedPct(opts.opexChangePct, 0)}`
        : "None",
    ],
    [
      "Cash",
      data.cash
        ? `Opening = bank balance on ${data.cash.asOf}. Closing = opening + net profit. Timing of receivables and payables, asset purchases, loans and tax payments are not included.`
        : "Not available",
    ],
  ];
  return (
    <dl className="space-y-2.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
          <dt className="text-slate-400">{k}</dt>
          <dd className="text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- small pieces ---------------- */

function axisFmt(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

function Card({ title, hint, className = "", children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">{title}</div>
        {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, alt, note, tone }: { label: string; value: string; alt?: string; note: string; tone?: "good" | "watch" | "risk" }) {
  const ring = tone === "good" ? "border-emerald-300/30" : tone === "watch" ? "border-amber-300/30" : tone === "risk" ? "border-rose-300/30" : "border-white/10";
  const dot = tone === "good" ? "bg-emerald-300" : tone === "watch" ? "bg-amber-300" : tone === "risk" ? "bg-rose-300" : "bg-slate-300";
  return (
    <div className={`rounded-2xl border ${ring} bg-gradient-to-b from-white/10 to-white/5 p-4 backdrop-blur-xl`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-300">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</div>
      {alt ? <div className="text-xs font-medium text-slate-300 tabular-nums">{alt}</div> : null}
      <div className="mt-1 text-xs text-slate-400">{note}</div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-xl border p-3.5 ${TONE[insight.tone]}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]" aria-hidden>
          {TONE_ICON[insight.tone]}
        </span>
        {insight.title}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{insight.text}</p>
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string; kind: "line" | "bar" }> }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={it.kind === "line" ? "h-0.5 w-4 rounded" : "h-2.5 w-2.5 rounded-sm"} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-300" />
        Forecast
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
  title,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  options: Array<{ v: string | number; label: string }>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="block" title={title}>
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-300">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={String(o.v)} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">{text}</div>;
}
