"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
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

function classDelta(n: number) {
  return n > 0 ? "text-emerald-300" : n < 0 ? "text-rose-300" : "text-slate-200";
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="text-xs text-slate-300">{subtitle}</div> : null}
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
              Tip: choose <b>Exclude</b> + tick items = “All except selected”.
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

  const quarterlyGrowthData = useMemo(() => {
    if (!monthTotals.length) return [] as Array<{ quarter: string; revenue: number; growthPct: number }>;

    const quarterRevenue = new Map<string, number>();
    const quarterOrder = new Map<string, number>();

    for (const row of monthTotals) {
      const parts = String(row.month ?? "").split("-");
      const year = Number(parts[0]);
      const monthNumber = Number(parts[1]);
      if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) continue;

      const quarterNo = Math.floor((monthNumber - 1) / 3) + 1;
      const quarterKey = `${year}-Q${quarterNo}`;
      quarterRevenue.set(quarterKey, (quarterRevenue.get(quarterKey) ?? 0) + Number(row.totalRevenue ?? 0));
      quarterOrder.set(quarterKey, year * 10 + quarterNo);
    }

    const orderedQuarters = Array.from(quarterRevenue.keys()).sort(
      (a, b) => (quarterOrder.get(a) ?? 0) - (quarterOrder.get(b) ?? 0)
    );

    return orderedQuarters.map((quarter, i) => {
      const revenue = quarterRevenue.get(quarter) ?? 0;
      const prevRevenue = i > 0 ? quarterRevenue.get(orderedQuarters[i - 1]) ?? 0 : 0;
      const growthPct = prevRevenue ? (revenue - prevRevenue) / prevRevenue : 0;
      return { quarter, revenue, growthPct };
    });
  }, [monthTotals]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(34,211,238,0.10),transparent_55%),radial-gradient(1000px_700px_at_55%_95%,rgba(99,102,241,0.10),transparent_55%),linear-gradient(180deg,#050814_0%,#070b1a_45%,#050814_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Revenue Analytics</h1>
            <p className="mt-1 text-sm text-slate-300">Slicer-driven Revenue Growth + Churn + Team Revenue distribution.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
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
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Total Revenue (Filtered)</div>
            <div className="mt-2 text-2xl font-semibold">{fmtMoney(totalRevenueFiltered, symbol)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Selected Months</div>
            <div className="mt-2 text-xl font-semibold">{months.length ? months.length : "All"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Selected Companies</div>
            <div className="mt-2 text-xl font-semibold">{companies.length ? companies.length : "All"}</div>
          </div>
        </div>

        {/* Growth chart + Growth table (PRIMARY) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Revenue Growth (Monthly, Company-wise)" subtitle="Lines per company (includes Total Revenue line)">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ok ? (data as any).growthSeries : []} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                  <Tooltip content={<MoneyTooltip symbol={symbol} />} />
                  <Legend />
                  <Line type="monotone" dataKey="totalRevenue" name="Total Revenue" stroke="#60a5fa" strokeWidth={3} dot={false} />
                  {growthLineKeys.map((k) => (
                    <Line key={k} type="monotone" dataKey={k} name={k} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Revenue Growth Table" subtitle="Change (Δ) and Change % (green = positive, red = negative)">
            {ok ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-300">
                    <tr>
                      <th className="py-2 pr-3">Month</th>
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 text-right">Revenue</th>
                      <th className="py-2 text-right">Δ</th>
                      <th className="py-2 text-right">Δ%</th>
                      <th className="py-2 text-right">Total (Month)</th>
                      <th className="py-2 text-right">Total Δ%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data as any).growthTable?.length ? (
                      (data as any).growthTable.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-white/10">
                          <td className="py-2 pr-3">{r.month}</td>
                          <td className="py-2 pr-3">{r.company}</td>
                          <td className="py-2 text-right font-semibold">{fmtMoney(Number(r.revenue ?? 0), symbol)}</td>
                          <td className={`py-2 text-right font-semibold ${classDelta(Number(r.change ?? 0))}`}>
                            {fmtMoney(Number(r.change ?? 0), symbol)}
                          </td>
                          <td className={`py-2 text-right font-semibold ${classDelta(Number(r.changePct ?? 0))}`}>
                            {fmtPct(Number(r.changePct ?? 0))}
                          </td>
                          <td className="py-2 text-right font-semibold text-slate-200">
                            {fmtMoney(Number(r.totalRevenue ?? 0), symbol)}
                          </td>
                          <td className={`py-2 text-right font-semibold ${classDelta(Number(r.totalChangePct ?? 0))}`}>
                            {fmtPct(Number(r.totalChangePct ?? 0))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-3 text-slate-300">
                          No growth rows for selected slicers.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-3 text-slate-300">Loading…</div>
            )}
          </Panel>
        </div>

        <div className="mt-4">
          <Panel
            title="Quarterly Revenue Growth Bar Chart"
            subtitle="Quarter-over-quarter growth % based on slicer-filtered monthly totals."
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quarterlyGrowthData} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="quarter" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={AXIS_LINE}
                    tickLine={TICK_LINE}
                    tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    formatter={(value: number, _name, item: any) => [fmtPct(Number(value ?? 0)), item?.name ?? "QoQ Growth"]}
                    labelFormatter={(label: string, payload: any) => {
                      const row = payload?.[0]?.payload;
                      return `${label} • Revenue ${fmtMoney(Number(row?.revenue ?? 0), symbol)}`;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="growthPct" name="QoQ Growth" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Churn vs Growth + row-click drill */}
        <div className="mt-4">
          <Panel
            title="Monthly Revenue Churn Rate vs Growth Rate (Company-wise)"
            subtitle="Click a row to see revenue bridge: lost/new customers + expansion/contraction from existing customers."
          >
            {ok ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-slate-300">
                      <tr>
                        <th className="py-2 pr-3">Company</th>
                        <th className="py-2 pr-3">Month</th>
                        <th className="py-2 text-right">Prev Total</th>
                        <th className="py-2 text-right">Current Total</th>
                        <th className="py-2 text-right">Lost Revenue</th>
                        <th className="py-2 text-right">Added Revenue</th>
                        <th className="py-2 text-right">Existing ↑</th>
                        <th className="py-2 text-right">Existing ↓</th>
                        <th className="py-2 text-right">Existing Net</th>
                        <th className="py-2 text-right">Net Δ</th>
                        <th className="py-2 text-right">Churn Rate</th>
                        <th className="py-2 text-right">Growth Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {churnRows.length ? (
                        churnRows.slice(-36).map((r: any, i: number) => {
                          const key = `${r.company}||${r.month}`;
                          const active = selectedChurnKey === key;
                          return (
                            <tr
                              key={i}
                              className={`border-t border-white/10 cursor-pointer hover:bg-white/5 ${active ? "bg-white/5" : ""}`}
                              onClick={() => setSelectedChurnKey(key)}
                              title="Click to view customer drill"
                            >
                              <td className="py-2 pr-3 font-semibold">{r.company}</td>
                              <td className="py-2 pr-3">{r.month}</td>
                              <td className="py-2 text-right">{fmtMoney(Number(r.prevTotal ?? 0), symbol)}</td>
                              <td className="py-2 text-right font-semibold">{fmtMoney(Number(r.currentTotal ?? 0), symbol)}</td>
                              <td className="py-2 text-right font-semibold text-rose-300">
                                {fmtMoney(Number(r.lostRevenue ?? 0), symbol)}
                              </td>
                              <td className="py-2 text-right font-semibold text-emerald-300">
                                {fmtMoney(Number(r.addedRevenue ?? 0), symbol)}
                              </td>
                              <td className="py-2 text-right font-semibold text-emerald-300">
                                {fmtMoney(Number(r.expansionRevenue ?? 0), symbol)}
                              </td>
                              <td className="py-2 text-right font-semibold text-rose-300">
                                {fmtMoney(Number(r.contractionRevenue ?? 0), symbol)}
                              </td>
                              <td className={`py-2 text-right font-semibold ${classDelta(Number(r.existingCustomerDelta ?? 0))}`}>
                                {fmtMoney(Number(r.existingCustomerDelta ?? 0), symbol)}
                              </td>
                              <td className={`py-2 text-right font-semibold ${classDelta(Number(r.netRevenueDelta ?? 0))}`}>
                                {fmtMoney(Number(r.netRevenueDelta ?? 0), symbol)}
                              </td>
                              <td className="py-2 text-right">{fmtPct(Number(r.churnRate ?? 0))}</td>
                              <td className={`py-2 text-right font-semibold ${classDelta(Number(r.growthRate ?? 0))}`}>
                                {fmtPct(Number(r.growthRate ?? 0))}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={12} className="py-3 text-slate-300">
                            No churn rows for selected slicers.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">Net Change (Current - Prev)</div>
                    <div className={`mt-1 text-base font-semibold ${classDelta(Number(churnSelected?.netRevenueDelta ?? 0))}`}>
                      {churnSelected ? fmtMoney(Number(churnSelected.netRevenueDelta ?? 0), symbol) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">Lost (Churned Customers)</div>
                    <div className="mt-1 text-base font-semibold text-rose-300">
                      {churnSelected ? fmtMoney(Number(churnSelected.lostRevenue ?? 0), symbol) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">New (Added Customers)</div>
                    <div className="mt-1 text-base font-semibold text-emerald-300">
                      {churnSelected ? fmtMoney(Number(churnSelected.addedRevenue ?? 0), symbol) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">Existing Customer Net</div>
                    <div className={`mt-1 text-base font-semibold ${classDelta(Number(churnSelected?.existingCustomerDelta ?? 0))}`}>
                      {churnSelected ? fmtMoney(Number(churnSelected.existingCustomerDelta ?? 0), symbol) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">Existing Expansion (↑)</div>
                    <div className="mt-1 text-base font-semibold text-emerald-300">
                      {churnSelected ? fmtMoney(Number(churnSelected.expansionRevenue ?? 0), symbol) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                    <div className="text-[11px] text-slate-300">Existing Contraction (↓)</div>
                    <div className="mt-1 text-base font-semibold text-rose-300">
                      {churnSelected ? fmtMoney(Number(churnSelected.contractionRevenue ?? 0), symbol) : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel
                    title="Lost Customers (Previous month only)"
                    subtitle="Customers present in previous month but missing in current month (shows last month revenue)"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-300">Click a churn row above to see details.</div>
                    ) : churnSelected.lostCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Last Month Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.lostCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">{x.customer}</td>
                                <td className="py-2 text-right font-semibold text-rose-300">
                                  {fmtMoney(Number(x.lastMonthRevenue ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-300">No lost customers for this selection.</div>
                    )}
                  </Panel>

                  <Panel
                    title="New Customers (Current month only)"
                    subtitle="Customers present in current month but missing in previous month (shows current month revenue)"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-300">Click a churn row above to see details.</div>
                    ) : churnSelected.addedCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
                            <tr>
                              <th className="py-2 pr-3">Customer</th>
                              <th className="py-2 text-right">Current Month Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {churnSelected.addedCustomers.slice(0, 30).map((x: any, i: number) => (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">{x.customer}</td>
                                <td className="py-2 text-right font-semibold text-emerald-300">
                                  {fmtMoney(Number(x.currentMonthRevenue ?? 0), symbol)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-300">No new customers for this selection.</div>
                    )}
                  </Panel>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel
                    title="Existing Customers: Revenue Increased"
                    subtitle="Customers present in both months with higher current revenue"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-300">Click a churn row above to see details.</div>
                    ) : churnSelected.expansionCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
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
                                <td className="py-2 pr-3">{x.customer}</td>
                                <td className="py-2 text-right">{fmtMoney(Number(x.prevMonthRevenue ?? 0), symbol)}</td>
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
                      <div className="text-sm text-slate-300">No existing-customer revenue increases for this selection.</div>
                    )}
                  </Panel>

                  <Panel
                    title="Existing Customers: Revenue Decreased"
                    subtitle="Customers present in both months with lower current revenue"
                  >
                    {!churnSelected ? (
                      <div className="text-sm text-slate-300">Click a churn row above to see details.</div>
                    ) : churnSelected.contractionCustomers?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
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
                                <td className="py-2 pr-3">{x.customer}</td>
                                <td className="py-2 text-right">{fmtMoney(Number(x.prevMonthRevenue ?? 0), symbol)}</td>
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
                      <div className="text-sm text-slate-300">No existing-customer revenue decreases for this selection.</div>
                    )}
                  </Panel>
                </div>

                {/* Team-wise revenue */}
                <div className="mt-4">
                  <Panel
                    title="Team Wise Revenue Bar Chart"
                    subtitle="Top 20 teams by revenue (strictly based on slicer-filtered data)."
                  >
                    <div className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(data as any).teamRevenue ?? []} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                          <CartesianGrid {...GRID} />
                          <XAxis
                            dataKey="team"
                            tick={AXIS_TICK}
                            axisLine={AXIS_LINE}
                            tickLine={TICK_LINE}
                            interval={0}
                            angle={-15}
                            height={70}
                          />
                          <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                          <Tooltip content={<MoneyTooltip symbol={symbol} />} />
                          <Legend />
                          <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      Note: Your sheet has no “Customer” column — this uses <b>Team</b> as customer label.
                    </div>
                  </Panel>
                </div>
              </>
            ) : (
              <div className="py-3 text-slate-300">Loading…</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
