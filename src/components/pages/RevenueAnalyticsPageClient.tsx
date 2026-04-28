"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell,
  LabelList,
} from "recharts";

type ApiResp =
  | {
      ok: true;
      currencySymbol: string;
      filters: { months: string[]; companies: string[]; sources: string[] };
      selected: {
        months: string[];
        companies: string[];
        sources: string[];
        months_mode: "include" | "exclude";
        companies_mode: "include" | "exclude";
        sources_mode: "include" | "exclude";
      };
      rawCount: number;
      filteredCount: number;

      monthTotals: Array<{ month: string; totalRevenue: number }>;
      growthSeries: Array<Record<string, any>>;
      growthTable: Array<{
        month: string;
        company: string;
        revenue: number;
        prevRevenue: number;
        change: number;
        changePct: number;
        totalRevenue: number;
        prevTotalRevenue: number;
        totalChange: number;
        totalChangePct: number;
      }>;
      churnVsGrowth: Array<{
        company: string;
        month: string;
        prevMonth: string | null;
        prevTotal: number;
        currentTotal: number;
        lostRevenue: number;
        addedRevenue: number;
        expansionRevenue: number;
        contractionRevenue: number;
        existingCustomerDelta: number;
        netRevenueDelta: number;
        churnRate: number;
        growthRate: number;
      }>;
      churnDetails: Array<{
        company: string;
        month: string;
        prevMonth: string | null;
        prevTotal: number;
        currentTotal: number;
        lostRevenue: number;
        addedRevenue: number;
        expansionRevenue: number;
        contractionRevenue: number;
        existingCustomerDelta: number;
        netRevenueDelta: number;
        churnRate: number;
        growthRate: number;
        lostCustomers: Array<{ customer: string; lastMonthRevenue: number }>;
        addedCustomers: Array<{ customer: string; currentMonthRevenue: number }>;
        expansionCustomers: Array<{ customer: string; prevMonthRevenue: number; currentMonthRevenue: number; delta: number }>;
        contractionCustomers: Array<{ customer: string; prevMonthRevenue: number; currentMonthRevenue: number; delta: number }>;
      }>;
      teamRevenue: Array<{ team: string; revenue: number }>;
    }
  | { ok: false; error: string };

function fmtMoney(n: number, symbol: string) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${symbol}${new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)}`;
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

const AXIS_TICK = { fill: "#e2e8f0", fontSize: 12, fontWeight: 600 } as const;
const AXIS_LINE = { stroke: "rgba(226,232,240,0.55)" } as const;
const TICK_LINE = { stroke: "rgba(226,232,240,0.35)" } as const;
const GRID = { strokeDasharray: "3 3", opacity: 0.22 } as const;

const LINE_PALETTE = [
  "#22d3ee", "#34d399", "#fb923c", "#a78bfa",
  "#f472b6", "#facc15", "#60a5fa", "#4ade80",
  "#f87171", "#94a3b8",
] as const;

function fmtAxisShort(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

function classDelta(n: number) {
  return n > 0 ? "text-emerald-300" : n < 0 ? "text-rose-300" : "text-slate-200";
}

function KpiCard({
  icon, label, value, sub, tone, sparkData,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone: "emerald" | "sky" | "rose" | "amber" | "neutral";
  sparkData?: Array<{ v: number }>;
}) {
  const borderColor = {
    emerald: "border-l-emerald-400/60",
    sky: "border-l-sky-400/60",
    rose: "border-l-rose-400/60",
    amber: "border-l-amber-400/60",
    neutral: "border-l-white/20",
  }[tone];
  const areaColor = {
    emerald: "#34d399", sky: "#38bdf8",
    rose: "#fb7185", amber: "#fbbf24", neutral: "#94a3b8",
  }[tone];
  return (
    <div className={`rounded-2xl border border-white/10 border-l-4 ${borderColor} bg-white/5 p-4 flex flex-col gap-2`}>
      <div className="text-[11px] uppercase tracking-widest text-slate-400">{icon} {label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
      {sparkData && sparkData.length > 1 && (
        <div className="h-10 w-full mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={areaColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone" dataKey="v"
                stroke={areaColor} strokeWidth={1.5}
                fill={`url(#spark-${tone})`} dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MoneyTooltip({ active, payload, label, symbol }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-slate-100">
      <div className="font-semibold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="text-slate-300">{p.name ?? p.dataKey}</span>
          <span className="font-semibold">{fmtMoney(Number(p.value ?? 0), symbol)}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  accent,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: "rose" | "emerald" | "sky" | "amber";
}) {
  const accentClass = accent ? {
    rose: "border-l-4 border-l-rose-400/60",
    emerald: "border-l-4 border-l-emerald-400/60",
    sky: "border-l-4 border-l-sky-400/60",
    amber: "border-l-4 border-l-amber-400/60",
  }[accent] : "";
  return (
    <div className={`rounded-2xl border border-white/10 ${accentClass} bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]`}>
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="text-xs text-slate-400">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  setSelected,
  mode,
  setMode,
  placeholder = "All",
}: {
  label: string;
  options: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  mode: "include" | "exclude";
  setMode: (v: "include" | "exclude") => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((x) => x.toLowerCase().includes(qq));
  }, [options, q]);

  const allSelected = selected.length === 0;

  return (
    <div className="relative">
      <div className="text-xs text-slate-300">{label}</div>

      <button
        onClick={() => setOpen((s) => !s)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-left"
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            {allSelected ? placeholder : `${selected.length} selected (${mode === "include" ? "Include" : "Exclude"})`}
          </div>
          <span className="text-slate-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-white/10 bg-[#050814] shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
          <div className="p-3 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
              />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="rounded-xl border border-white/10 bg-black/40 px-2 py-2 text-sm outline-none"
                title="Include / Exclude mode"
              >
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
            </div>

            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => setSelected([])}
                type="button"
                title="Empty selection means ALL"
              >
                All
              </button>
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => setSelected(filtered)}
                type="button"
                title="Select all currently filtered"
              >
                All (filtered)
              </button>
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => setSelected([])}
                type="button"
                title="Same as All"
              >
                Clear
              </button>
            </div>

            <div className="mt-2 text-[11px] text-slate-400">
              Tip: choose <b>Exclude</b> + tick items = "All except selected".
            </div>
          </div>

          <div className="max-h-64 overflow-auto p-2">
            {filtered.length ? (
              filtered.map((opt) => {
                const checked = selected.includes(opt);
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) setSelected(selected.filter((x) => x !== opt));
                        else setSelected([...selected, opt]);
                      }}
                    />
                    <span className="text-sm text-slate-200">{opt}</span>
                  </label>
                );
              })
            ) : (
              <div className="p-3 text-sm text-slate-400">No matches.</div>
            )}
          </div>

          <div className="p-2 border-t border-white/10">
            <button
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => setOpen(false)}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RevenueAnalyticsPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [months, setMonths] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);

  const [monthsMode, setMonthsMode] = useState<"include" | "exclude">("include");
  const [companiesMode, setCompaniesMode] = useState<"include" | "exclude">("include");
  const [sourcesMode, setSourcesMode] = useState<"include" | "exclude">("include");

  const [selectedChurnKey, setSelectedChurnKey] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    setErr("");
    try {
      const sp = new URLSearchParams();

      if (months.length) sp.set("months", months.join(","));
      if (companies.length) sp.set("companies", companies.join(","));
      if (sources.length) sp.set("sources", sources.join(","));

      sp.set("months_mode", monthsMode);
      sp.set("companies_mode", companiesMode);
      sp.set("sources_mode", sourcesMode);

      const res = await fetch(`/api/revenue-analytics?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResp;

      if (!json || (json as any).ok !== true) throw new Error((json as any)?.error || "Failed to load revenue analytics");
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load revenue analytics");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = !!data && (data as any).ok === true;
  const filters = ok ? (data as any).filters : { months: [], companies: [], sources: [] };
  const symbol = ok ? (data as any).currencySymbol || "$" : "$";

  const monthTotals = ok ? ((data as any).monthTotals as Array<{ month: string; totalRevenue: number }>) : [];
  const totalRevenueFiltered = useMemo(
    () => monthTotals.reduce((s, x) => s + (x.totalRevenue || 0), 0),
    [monthTotals]
  );

  const churnRows = ok ? (((data as any).churnVsGrowth as any[]) ?? []) : [];
  const churnDetails = ok ? (((data as any).churnDetails as any[]) ?? []) : [];

  const churnSelected = useMemo(() => {
    if (!ok || !selectedChurnKey) return null;
    const [company, month] = selectedChurnKey.split("||");
    return churnDetails.find((x) => x.company === company && x.month === month) ?? null;
  }, [ok, selectedChurnKey, churnDetails]);

  const growthSeries = ok ? ((data as any).growthSeries as any[]) : [];
  const growthLineKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of growthSeries) {
      Object.keys(row || {}).forEach((k) => {
        if (k !== "month" && k !== "totalRevenue") keys.add(k);
      });
    }
    return Array.from(keys);
  }, [growthSeries]);

  const avgMonthlyRevenue = useMemo(
    () => (monthTotals.length ? totalRevenueFiltered / monthTotals.length : 0),
    [monthTotals, totalRevenueFiltered]
  );

  const peakMonth = useMemo(
    () => monthTotals.reduce((best, x) => (!best || x.totalRevenue > best.totalRevenue ? x : best), monthTotals[0] ?? null),
    [monthTotals]
  );

  const churnCards = useMemo(() => churnRows.slice(-12), [churnRows]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(34,211,238,0.10),transparent_55%),radial-gradient(1000px_700px_at_55%_95%,rgba(99,102,241,0.10),transparent_55%),linear-gradient(180deg,#050814_0%,#070b1a_45%,#050814_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Revenue Analytics</h1>
              {ok && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
                  {(data as any).filteredCount} rows
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">Slicer-driven Revenue Growth · Churn · Team Distribution</p>
            <div className="mt-2 h-[2px] w-32 rounded-full bg-gradient-to-r from-emerald-400/80 via-sky-400/60 to-transparent" />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              prefetch={false}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              ← Back to Dashboard
            </Link>
            <button
              onClick={fetchData}
              className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20"
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Slicers */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MultiSelect
              label="Month"
              options={filters.months}
              selected={months}
              setSelected={setMonths}
              mode={monthsMode}
              setMode={setMonthsMode}
            />
            <MultiSelect
              label="Company"
              options={filters.companies}
              selected={companies}
              setSelected={setCompanies}
              mode={companiesMode}
              setMode={setCompaniesMode}
            />
            <MultiSelect
              label="Source"
              options={filters.sources}
              selected={sources}
              setSelected={setSources}
              mode={sourcesMode}
              setMode={setSourcesMode}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-300">
              {ok ? (
                <span>
                  Rows: <span className="text-slate-100 font-semibold">{(data as any).filteredCount}</span> filtered (from{" "}
                  {(data as any).rawCount})
                </span>
              ) : (
                <span>Waiting for data…</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedChurnKey(null);
                  fetchData();
                }}
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
                disabled={loading}
                type="button"
              >
                Apply
              </button>
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {err}
            </div>
          ) : null}
        </div>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon="$" label="Total Revenue"
            value={fmtMoney(totalRevenueFiltered, symbol)}
            sub="Filtered period"
            tone="emerald"
            sparkData={monthTotals.map((x) => ({ v: x.totalRevenue }))}
          />
          <KpiCard
            icon="~" label="Avg Monthly"
            value={fmtMoney(avgMonthlyRevenue, symbol)}
            sub={`Over ${monthTotals.length} month${monthTotals.length !== 1 ? "s" : ""}`}
            tone="sky"
            sparkData={monthTotals.map((x) => ({ v: x.totalRevenue }))}
          />
          <KpiCard
            icon="^" label="Peak Month"
            value={peakMonth ? peakMonth.month : "—"}
            sub={peakMonth ? fmtMoney(peakMonth.totalRevenue, symbol) : ""}
            tone="amber"
          />
          <KpiCard
            icon="#" label="Months Shown"
            value={String(monthTotals.length || "—")}
            sub={months.length ? `${months.length} selected` : "All months"}
            tone="neutral"
          />
          <KpiCard
            icon="@" label="Companies"
            value={companies.length ? String(companies.length) : (ok ? String((data as any).filters.companies.length) : "—")}
            sub={companies.length ? `${companiesMode} filter` : "All companies"}
            tone="sky"
          />
          <KpiCard
            icon="!" label="Data Sources"
            value={sources.length ? String(sources.length) : "All"}
            sub={sources.length ? `${sourcesMode} filter` : "No filter"}
            tone="neutral"
          />
        </div>

        {/* Section 2: Revenue Overview Chart (full-width) */}
        <div className="mt-4">
          <Panel
            title="Revenue Overview — Monthly Trend"
            subtitle="Total revenue area (sky fill) + per-company lines. Amber dashed line = average monthly revenue."
          >
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={ok ? (data as any).growthSeries : []}
                  margin={{ top: 14, right: 20, left: 8, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="totalRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisShort} width={56} />
                  <Tooltip content={<MoneyTooltip symbol={symbol} />} />
                  <Legend wrapperStyle={{ paddingTop: 8 }} />
                  <Area
                    type="monotone" dataKey="totalRevenue" name="Total Revenue"
                    stroke="#38bdf8" strokeWidth={2.5}
                    fill="url(#totalRevGrad)" dot={false}
                    activeDot={{ r: 5, fill: "#38bdf8", stroke: "#e0f2fe", strokeWidth: 2 }}
                  />
                  {growthLineKeys.map((k, i) => (
                    <Line
                      key={k} type="monotone" dataKey={k} name={k}
                      stroke={LINE_PALETTE[i % LINE_PALETTE.length]}
                      strokeWidth={1.8} dot={false}
                      strokeDasharray={i % 3 === 2 ? "5 3" : undefined}
                    />
                  ))}
                  {avgMonthlyRevenue > 0 && (
                    <ReferenceLine
                      y={avgMonthlyRevenue} stroke="#fbbf24"
                      strokeDasharray="6 4" strokeWidth={1.5}
                      label={{ value: `Avg ${fmtAxisShort(avgMonthlyRevenue)}`, fill: "#fbbf24", fontSize: 11, position: "right" }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Section 3: Monthly Revenue Bar + Redesigned Growth Table */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Monthly Revenue Totals" subtitle="Bar height = total revenue for that month. Amber bar = peak month.">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthTotals} margin={{ top: 10, right: 12, left: 4, bottom: 6 }}>
                  <defs>
                    <linearGradient id="monthBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} interval={0} angle={-20} height={50} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisShort} width={52} />
                  <Tooltip content={<MoneyTooltip symbol={symbol} />} />
                  <Bar dataKey="totalRevenue" name="Revenue" radius={[6, 6, 0, 0]}>
                    {monthTotals.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.month === peakMonth?.month ? "#fbbf24" : "url(#monthBarGrad)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Peak month
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Other months
              </span>
            </div>
          </Panel>

          <Panel title="Revenue Growth Table" subtitle="Pill badges: emerald = positive Δ%, rose = negative. Best/worst rows highlighted.">
            {ok ? (
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#070b1a] text-left text-xs text-slate-400 z-10">
                    <tr>
                      <th className="py-2 pr-3">Month</th>
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 text-right">Revenue</th>
                      <th className="py-2 text-right">Δ</th>
                      <th className="py-2 text-right">Δ%</th>
                      <th className="py-2 text-right">Total Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data as any).growthTable?.length ? (() => {
                      const rows = (data as any).growthTable as any[];
                      const maxPct = Math.max(...rows.map((r: any) => Number(r.changePct ?? 0)));
                      const minPct = Math.min(...rows.map((r: any) => Number(r.changePct ?? 0)));
                      return rows.map((r: any, i: number) => {
                        const pct = Number(r.changePct ?? 0);
                        const isBest = pct === maxPct && maxPct > 0;
                        const isWorst = pct === minPct && minPct < 0;
                        return (
                          <tr
                            key={i}
                            className={`border-t border-white/10 ${isBest ? "bg-emerald-500/5" : isWorst ? "bg-rose-500/5" : ""}`}
                          >
                            <td className="py-1.5 pr-3 text-xs">{r.month}</td>
                            <td className="py-1.5 pr-3 font-medium text-xs">{r.company}</td>
                            <td className="py-1.5 text-right text-xs font-semibold">{fmtMoney(Number(r.revenue ?? 0), symbol)}</td>
                            <td className={`py-1.5 text-right text-xs font-semibold ${classDelta(Number(r.change ?? 0))}`}>
                              {fmtMoney(Number(r.change ?? 0), symbol)}
                            </td>
                            <td className="py-1.5 text-right">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                pct > 0 ? "bg-emerald-500/15 text-emerald-300"
                                : pct < 0 ? "bg-rose-500/15 text-rose-300"
                                : "bg-white/5 text-slate-400"
                              }`}>
                                {fmtPct(pct)}
                              </span>
                            </td>
                            <td className="py-1.5 text-right">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                Number(r.totalChangePct ?? 0) > 0 ? "bg-sky-500/15 text-sky-300"
                                : Number(r.totalChangePct ?? 0) < 0 ? "bg-rose-500/15 text-rose-300"
                                : "bg-white/5 text-slate-400"
                              }`}>
                                {fmtPct(Number(r.totalChangePct ?? 0))}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })() : (
                      <tr>
                        <td colSpan={6} className="py-3 text-slate-400">No growth rows for selected slicers.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-3 text-slate-400">Loading…</div>
            )}
          </Panel>
        </div>

        {/* Section 4: Revenue Health Cards */}
        <div className="mt-4">
          <Panel
            title="Revenue Health — Churn vs Growth"
            subtitle="Last 12 company-month entries. Click a card to open the Revenue Bridge + customer drill detail below."
          >
            {ok ? (
              <>
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {churnCards.length ? churnCards.map((r: any) => {
                    const key = `${r.company}||${r.month}`;
                    const active = selectedChurnKey === key;
                    const churn = Number(r.churnRate ?? 0);
                    const growth = Number(r.growthRate ?? 0);
                    const lost = Math.abs(Number(r.lostRevenue ?? 0));
                    const added = Number(r.addedRevenue ?? 0);
                    const total = lost + added || 1;
                    const lostPct = Math.round((lost / total) * 100);
                    const addedPct = Math.round((added / total) * 100);
                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedChurnKey(active ? null : key)}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 cursor-pointer transition-all duration-150 ${
                          active
                            ? "border-sky-400/50 bg-sky-500/8 ring-1 ring-sky-400/30"
                            : "border-white/10 bg-white/3 hover:bg-white/6"
                        }`}
                      >
                        <div className="min-w-[120px] font-semibold text-sm text-white">{r.company}</div>
                        <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{r.month}</div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          churn > 0.15 ? "bg-rose-500/20 text-rose-300"
                          : churn > 0.05 ? "bg-amber-500/20 text-amber-300"
                          : "bg-emerald-500/15 text-emerald-300"
                        }`}>
                          Churn {fmtPct(churn)}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          growth > 0 ? "bg-emerald-500/15 text-emerald-300"
                          : growth < 0 ? "bg-rose-500/15 text-rose-300"
                          : "bg-white/5 text-slate-400"
                        }`}>
                          Growth {fmtPct(growth)}
                        </span>
                        <div className="ml-auto flex items-center gap-2 min-w-[140px]">
                          <span className="text-[10px] text-rose-300">{fmtAxisShort(lost)}</span>
                          <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div className="bg-rose-400/70 h-full" style={{ width: `${lostPct}%` }} />
                            <div className="bg-emerald-400/70 h-full" style={{ width: `${addedPct}%` }} />
                          </div>
                          <span className="text-[10px] text-emerald-300">{fmtAxisShort(added)}</span>
                        </div>
                        <div className={`text-xs font-bold ${classDelta(Number(r.netRevenueDelta ?? 0))}`}>
                          Net {fmtMoney(Number(r.netRevenueDelta ?? 0), symbol)}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="py-4 text-sm text-slate-400">No churn data for selected filters.</div>
                  )}
                </div>

                {/* Section 5A: Revenue Bridge */}
                {churnSelected ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                      Revenue Bridge — {churnSelected.company} · {churnSelected.month}
                    </div>
                    <div className="flex flex-wrap items-stretch gap-2">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-[110px]">
                        <div className="text-[10px] text-slate-400 mb-1">Prev Total</div>
                        <div className="text-sm font-bold text-slate-200">{fmtMoney(Number(churnSelected.prevTotal ?? 0), symbol)}</div>
                      </div>
                      <div className="flex items-center text-slate-500 text-lg">→</div>
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 min-w-[100px]">
                        <div className="text-[10px] text-rose-400 mb-1">− Lost</div>
                        <div className="text-sm font-bold text-rose-300">{fmtMoney(Number(churnSelected.lostRevenue ?? 0), symbol)}</div>
                        <div className="mt-1 h-1 rounded-full bg-rose-500/30">
                          <div className="h-1 rounded-full bg-rose-400" style={{ width: `${Math.min(100, Math.abs(Number(churnSelected.lostRevenue ?? 0)) / (Number(churnSelected.prevTotal || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 min-w-[100px]">
                        <div className="text-[10px] text-emerald-400 mb-1">+ New</div>
                        <div className="text-sm font-bold text-emerald-300">{fmtMoney(Number(churnSelected.addedRevenue ?? 0), symbol)}</div>
                        <div className="mt-1 h-1 rounded-full bg-emerald-500/30">
                          <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Number(churnSelected.addedRevenue ?? 0) / (Number(churnSelected.prevTotal || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 min-w-[100px]">
                        <div className="text-[10px] text-sky-400 mb-1">+ Expansion</div>
                        <div className="text-sm font-bold text-sky-300">{fmtMoney(Number(churnSelected.expansionRevenue ?? 0), symbol)}</div>
                      </div>
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 min-w-[100px]">
                        <div className="text-[10px] text-amber-400 mb-1">− Contraction</div>
                        <div className="text-sm font-bold text-amber-300">{fmtMoney(Number(churnSelected.contractionRevenue ?? 0), symbol)}</div>
                      </div>
                      <div className="flex items-center text-slate-500 text-lg">=</div>
                      <div className={`rounded-xl border px-4 py-3 min-w-[110px] ${
                        Number(churnSelected.netRevenueDelta ?? 0) >= 0
                          ? "border-emerald-500/30 bg-emerald-500/8"
                          : "border-rose-500/30 bg-rose-500/8"
                      }`}>
                        <div className="text-[10px] text-slate-400 mb-1">Current Total</div>
                        <div className="text-sm font-bold text-white">{fmtMoney(Number(churnSelected.currentTotal ?? 0), symbol)}</div>
                        <div className={`text-[10px] font-semibold mt-0.5 ${classDelta(Number(churnSelected.netRevenueDelta ?? 0))}`}>
                          Net {fmtMoney(Number(churnSelected.netRevenueDelta ?? 0), symbol)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400">
                    Select a company-month card above to see the Revenue Bridge breakdown.
                  </div>
                )}

                {/* Section 5B: Customer Drill-Down */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel
                    title={`Lost Customers${churnSelected?.lostCustomers?.length ? ` (${churnSelected.lostCustomers.length})` : ""}`}
                    subtitle="Present last month, missing this month"
                    accent="rose"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-400">Select a card above to see details.</div>
                    ) : churnSelected.lostCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-400">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Last Month Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.lostCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                                    {x.customer}
                                  </div>
                                </td>
                                <td className="py-2 text-right font-semibold text-rose-300">
                                  {fmtMoney(Number(x.lastMonthRevenue ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">No lost customers for this selection.</div>
                    )}
                  </Panel>

                  <Panel
                    title={`New Customers${churnSelected?.addedCustomers?.length ? ` (${churnSelected.addedCustomers.length})` : ""}`}
                    subtitle="Present this month, missing last month"
                    accent="emerald"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-400">Select a card above to see details.</div>
                    ) : churnSelected.addedCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-400">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Current Month Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.addedCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    {x.customer}
                                  </div>
                                </td>
                                <td className="py-2 text-right font-semibold text-emerald-300">
                                  {fmtMoney(Number(x.currentMonthRevenue ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">No new customers for this selection.</div>
                    )}
                  </Panel>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel
                    title={`Existing — Revenue Increased${churnSelected?.expansionCustomers?.length ? ` (${churnSelected.expansionCustomers.length})` : ""}`}
                    subtitle="Present both months with higher current revenue"
                    accent="sky"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-400">Select a card above to see details.</div>
                    ) : churnSelected.expansionCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-400">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Prev</th>
                              <th className="py-2 text-right">Current</th>
                              <th className="py-2 text-right">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.expansionCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 flex-shrink-0" />
                                    {x.customer}
                                  </div>
                                </td>
                                <td className="py-2 text-right text-slate-300">{fmtMoney(Number(x.prevMonthRevenue ?? 0), symbol)}</td>
                                <td className="py-2 text-right">{fmtMoney(Number(x.currentMonthRevenue ?? 0), symbol)}</td>
                                <td className="py-2 text-right font-semibold text-emerald-300">
                                  {fmtMoney(Number(x.delta ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">No revenue increases for this selection.</div>
                    )}
                  </Panel>

                  <Panel
                    title={`Existing — Revenue Decreased${churnSelected?.contractionCustomers?.length ? ` (${churnSelected.contractionCustomers.length})` : ""}`}
                    subtitle="Present both months with lower current revenue"
                    accent="amber"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-400">Select a card above to see details.</div>
                    ) : churnSelected.contractionCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-400">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Prev</th>
                              <th className="py-2 text-right">Current</th>
                              <th className="py-2 text-right">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.contractionCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                    {x.customer}
                                  </div>
                                </td>
                                <td className="py-2 text-right text-slate-300">{fmtMoney(Number(x.prevMonthRevenue ?? 0), symbol)}</td>
                                <td className="py-2 text-right">{fmtMoney(Number(x.currentMonthRevenue ?? 0), symbol)}</td>
                                <td className="py-2 text-right font-semibold text-rose-300">
                                  {fmtMoney(Number(x.delta ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">No revenue decreases for this selection.</div>
                    )}
                  </Panel>
                </div>
              </>
            ) : (
              <div className="py-3 text-slate-400">Loading…</div>
            )}
          </Panel>
        </div>

        {/* Section 6: Team Revenue Distribution (standalone, horizontal bars) */}
        {ok && (data as any).teamRevenue?.length ? (() => {
          const teams: Array<{ team: string; revenue: number }> = (data as any).teamRevenue ?? [];
          const sorted = [...teams].sort((a, b) => b.revenue - a.revenue);
          const top5Revenue = sorted[4]?.revenue ?? sorted[sorted.length - 1]?.revenue ?? 0;
          const chartHeight = Math.max(320, sorted.length * 38);
          return (
            <div className="mt-4">
              <Panel
                title={`Team Revenue Distribution · ${sorted.length} team${sorted.length !== 1 ? "s" : ""}`}
                subtitle="Horizontal bars sorted by revenue. Emerald = top 5 teams, sky = others. Labels show exact value."
              >
                <div style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sorted}
                      layout="vertical"
                      margin={{ top: 6, right: 80, left: 8, bottom: 6 }}
                    >
                      <CartesianGrid {...GRID} horizontal={false} />
                      <XAxis
                        type="number" tick={AXIS_TICK}
                        axisLine={AXIS_LINE} tickLine={TICK_LINE}
                        tickFormatter={fmtAxisShort}
                      />
                      <YAxis
                        type="category" dataKey="team"
                        tick={{ ...AXIS_TICK, fontSize: 11 }}
                        axisLine={AXIS_LINE} tickLine={TICK_LINE}
                        width={110}
                      />
                      <Tooltip content={<MoneyTooltip symbol={symbol} />} />
                      <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {sorted.map((entry, index) => (
                          <Cell
                            key={`team-${index}`}
                            fill={entry.revenue >= top5Revenue ? "#34d399" : "#38bdf8"}
                            fillOpacity={0.85}
                          />
                        ))}
                        <LabelList
                          dataKey="revenue"
                          position="right"
                          formatter={(v: any) => fmtAxisShort(v)}
                          style={{ fill: "#cbd5e1", fontSize: 11, fontWeight: 600 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Top 5 teams
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" /> Other teams
                  </span>
                </div>
              </Panel>
            </div>
          );
        })() : null}
      </div>
    </div>
  );
}
