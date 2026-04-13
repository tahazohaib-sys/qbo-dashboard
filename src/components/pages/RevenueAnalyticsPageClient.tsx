"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ChartCtor = new (
  item: HTMLCanvasElement,
  config: Record<string, unknown>
) => { destroy: () => void };

type Filters = { months: string[]; companies: string[]; sources: string[] };
type GrowthSeriesRow = { month: string; totalRevenue: number; [key: string]: string | number };
type GrowthTableRow = {
  month: string;
  company: string;
  revenue: number;
  change: number;
  changePct: number;
  totalRevenue: number;
};
type ChurnRow = {
  company: string;
  month: string;
  prevMonth?: string | null;
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
};
type ChurnDetail = ChurnRow & {
  lostCustomers: Array<{ customer: string; lastMonthRevenue: number }>;
  addedCustomers: Array<{ customer: string; currentMonthRevenue: number }>;
  contractionCustomers: Array<{ customer: string; prevMonthRevenue: number; currentMonthRevenue: number; delta: number }>;
  expansionCustomers: Array<{ customer: string; prevMonthRevenue: number; currentMonthRevenue: number; delta: number }>;
};
type ApiResp = {
  ok: boolean;
  currencySymbol: string;
  rawCount: number;
  filteredCount: number;
  filters: Filters;
  growthSeries: GrowthSeriesRow[];
  growthTable: GrowthTableRow[];
  churnVsGrowth: ChurnRow[];
  churnDetails: ChurnDetail[];
  teamRevenue: Array<{ team: string; revenue: number }>;
  monthTotals: Array<{ month: string; totalRevenue: number }>;
  error?: string;
};

const COLORS = {
  bg: "#0f1117",
  card: "#1a1d27",
  surface: "#232636",
  blue: "#378ADD",
  green: "#639922",
  red: "#E24B4A",
  gray: "#888780",
  border: "rgba(255,255,255,0.07)",
  grid: "rgba(255,255,255,0.07)",
  tick: "rgba(255,255,255,0.45)",
};
const DEFAULT_MONTH_OPTIONS = ["2025/06", "2025/07", "2025/08", "2025/09", "2025/10", "2025/11", "2025/12", "2026/01", "2026/02", "2026/03", "2026/04"];
const DEFAULT_COMPANY_OPTIONS = ["Burac AI", "RTC League", "Stratager AI"];
const DEFAULT_SOURCE_OPTIONS = ["Agency", "Asif", "Direct", "khubaib", "Nasir", "Aslam", "Saad", "Usman"];

const money = (n: number, decimals = 2, symbol = "$") =>
  `${n < 0 ? "-" : ""}${symbol}${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
const money0 = (n: number, symbol = "$") => money(n, 0, symbol);
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(1)}%`);
const axisYk = (value: number) => `${value < 0 ? "-" : ""}$${Math.round(Math.abs(value) / 1000)}k`;

function MultiFilter({
  id,
  label,
  options,
  selected,
  setSelected,
  mode,
  setMode,
  openKey,
  setOpenKey,
  searchable = true,
  onApply,
}: {
  id: string;
  label: string;
  options: string[];
  selected: string[];
  setSelected: (v: string[]) => void;
  mode: "include" | "exclude";
  setMode: (v: "include" | "exclude") => void;
  openKey: string | null;
  setOpenKey: (v: string | null) => void;
  searchable?: boolean;
  onApply: () => void;
}) {
  const [q, setQ] = useState("");
  const open = openKey === id;
  const allSelected = selected.length === options.length;
  const visibleOptions = searchable ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const summary = `${selected.length} selected`;

  return (
    <div className="multi-filter">
      <button
        className="h-11 min-w-[210px] px-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-sm text-slate-100 flex items-center justify-between"
        type="button"
        onClick={() => setOpenKey(open ? null : id)}
      >
        <span>{label}: {summary}</span>
        <span className="chev">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="multi-menu">
          <div className="mode-head">Mode</div>
          <div className="mode-radio">
            <label><input type="radio" checked={mode === "include"} onChange={() => setMode("include")} /> Include</label>
            <label><input type="radio" checked={mode === "exclude"} onChange={() => setMode("exclude")} /> Exclude</label>
          </div>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          <div className="menu-divider" />
          <div className="menu-list">
            <label className="menu-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : [...options])}
              />
              Select all
            </label>
            {visibleOptions.map((opt) => (
              <label key={opt} className="menu-check">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() =>
                    setSelected(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt])
                  }
                />
                {opt}
              </label>
            ))}
          </div>
          <div className="panel-actions">
            <button type="button" className="mini-btn" onClick={() => setSelected([])}>Clear</button>
            <button type="button" className="mini-btn" onClick={() => setOpenKey(null)}>Done</button>
            <button type="button" className="mini-btn apply-mini" onClick={() => { onApply(); setOpenKey(null); }}>Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RevenueAnalyticsPageClient() {
  const growthRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<HTMLCanvasElement | null>(null);
  const teamRef = useRef<HTMLCanvasElement | null>(null);

  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [months, setMonths] = useState<string[]>(["2026/03"]);
  const [companies, setCompanies] = useState<string[]>(["RTC League"]);
  const [sources, setSources] = useState<string[]>([...DEFAULT_SOURCE_OPTIONS]);
  const [monthMode, setMonthMode] = useState<"include" | "exclude">("exclude");
  const [companyMode, setCompanyMode] = useState<"include" | "exclude">("include");
  const [sourceMode, setSourceMode] = useState<"include" | "exclude">("include");
  const [selectedChurnKey, setSelectedChurnKey] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  const symbol = data?.currencySymbol || "$";
  const monthOptions = data?.filters.months?.length ? data.filters.months : DEFAULT_MONTH_OPTIONS;
  const companyOptions = data?.filters.companies?.length ? data.filters.companies : DEFAULT_COMPANY_OPTIONS;
  const sourceOptions = data?.filters.sources?.length ? data.filters.sources : DEFAULT_SOURCE_OPTIONS;

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (months.length) params.set("months", months.join(","));
      if (companies.length) params.set("companies", companies.join(","));
      if (sources.length) params.set("sources", sources.join(","));
      params.set("months_mode", monthMode);
      params.set("companies_mode", companyMode);
      params.set("sources_mode", sourceMode);
      const res = await fetch(`/api/revenue-analytics?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as ApiResp;
      if (!json.ok) throw new Error(json.error || "Failed to load revenue data");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".multi-filter")) setOpenFilter(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const months = [...data.monthTotals].sort((a, b) => a.month.localeCompare(b.month));
    const latest = months[months.length - 1]?.totalRevenue ?? 0;
    const prev = months[months.length - 2]?.totalRevenue ?? 0;
    const latestMonth = months[months.length - 1]?.month;
    const latestRows = data.churnVsGrowth.filter((r) => r.month === latestMonth);
    const latestDetails = data.churnDetails.filter((r) => r.month === latestMonth);

    const lost = latestRows.reduce((s, r) => s + r.lostRevenue, 0);
    const added = latestRows.reduce((s, r) => s + r.addedRevenue, 0);
    const contraction = latestRows.reduce((s, r) => s + r.contractionRevenue, 0);
    const expansion = latestRows.reduce((s, r) => s + r.expansionRevenue, 0);
    const existingNet = latestRows.reduce((s, r) => s + r.existingCustomerDelta, 0);
    const total = months.reduce((s, r) => s + r.totalRevenue, 0);

    return {
      total,
      latest,
      prev,
      net: latest - prev,
      lost,
      added,
      contraction,
      expansion,
      existingNet,
      latestMonth,
      lostCount: latestDetails.reduce((s, r) => s + r.lostCustomers.length, 0),
      contractionCount: latestDetails.reduce((s, r) => s + r.contractionCustomers.length, 0),
      monthCount: months.length,
    };
  }, [data]);

  const growthDatasets = useMemo(() => {
    if (!data) return { labels: [], companyKeys: [] as string[] };
    const keys = new Set<string>();
    data.growthSeries.forEach((r) => Object.keys(r).forEach((k) => k !== "month" && k !== "totalRevenue" && keys.add(k)));
    return { labels: data.growthSeries.map((r) => r.month), companyKeys: [...keys] };
  }, [data]);

  const latestMonth = metrics?.latestMonth;
  const latestRows = useMemo(() => (data && latestMonth ? data.churnVsGrowth.filter((r) => r.month === latestMonth) : []), [data, latestMonth]);
  const selectedDetail = useMemo(
    () => (data ? data.churnDetails.find((d) => `${d.company}__${d.month}` === selectedChurnKey) : undefined),
    [data, selectedChurnKey]
  );
  const analysisRows = useMemo(() => (selectedDetail ? [selectedDetail] : latestRows), [latestRows, selectedDetail]);
  const analysisSummary = useMemo(() => {
    const prev = analysisRows.reduce((s, r) => s + r.prevTotal, 0);
    const current = analysisRows.reduce((s, r) => s + r.currentTotal, 0);
    return {
      net: current - prev,
      lost: analysisRows.reduce((s, r) => s + r.lostRevenue, 0),
      added: analysisRows.reduce((s, r) => s + r.addedRevenue, 0),
      existingNet: analysisRows.reduce((s, r) => s + r.existingCustomerDelta, 0),
      contraction: analysisRows.reduce((s, r) => s + r.contractionRevenue, 0),
      expansion: analysisRows.reduce((s, r) => s + r.expansionRevenue, 0),
    };
  }, [analysisRows]);
  const lostCustomers = useMemo(() => {
    if (selectedDetail) {
      return selectedDetail.lostCustomers
        .map((c) => ({ customer: c.customer, revenue: c.lastMonthRevenue }))
        .sort((a, b) => b.revenue - a.revenue);
    }
    if (!data || !latestMonth) return [] as Array<{ customer: string; revenue: number }>;
    return data.churnDetails
      .filter((r) => r.month === latestMonth)
      .flatMap((r) => r.lostCustomers.map((c) => ({ customer: c.customer, revenue: c.lastMonthRevenue })))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, latestMonth, selectedDetail]);

  const contractionCustomers = useMemo(() => {
    if (selectedDetail) {
      return selectedDetail.contractionCustomers
        .map((c) => ({ customer: c.customer, mar: c.prevMonthRevenue, apr: c.currentMonthRevenue, delta: c.delta }))
        .sort((a, b) => a.delta - b.delta);
    }
    if (!data || !latestMonth) return [] as Array<{ customer: string; mar: number; apr: number; delta: number }>;
    return data.churnDetails
      .filter((r) => r.month === latestMonth)
      .flatMap((r) =>
        r.contractionCustomers.map((c) => ({ customer: c.customer, mar: c.prevMonthRevenue, apr: c.currentMonthRevenue, delta: c.delta }))
      )
      .sort((a, b) => a.delta - b.delta);
  }, [data, latestMonth, selectedDetail]);

  useEffect(() => {
    if (!data || !growthRef.current || !waterfallRef.current || !teamRef.current || !metrics) return;

    const loadChart = async () => {
      if (!(window as { Chart?: ChartCtor }).Chart) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Chart.js"));
          document.head.appendChild(s);
        });
      }
      const ChartLib = (window as { Chart?: ChartCtor }).Chart;
      if (!ChartLib) return () => undefined;

      const growth = new ChartLib(growthRef.current!, {
        type: "line",
        data: {
          labels: growthDatasets.labels,
          datasets: [
            ...growthDatasets.companyKeys.map((k, idx) => ({
              label: k,
              data: data.growthSeries.map((r) => Number(r[k] || 0)),
              borderColor: idx === 0 ? COLORS.blue : COLORS.green,
              backgroundColor: idx === 0 ? "rgba(55,138,221,0.08)" : "rgba(99,153,34,0.08)",
              fill: true,
              tension: 0.35,
            })),
            {
              label: "Total",
              data: data.growthSeries.map((r) => r.totalRevenue),
              borderColor: COLORS.gray,
              borderDash: [5, 3],
              fill: false,
              tension: 0.35,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } },
            y: { ticks: { color: COLORS.tick, callback: (v: number | string) => axisYk(Number(v)) }, grid: { color: COLORS.grid } },
          },
        },
      });

      const start = analysisRows.reduce((s, r) => s + r.prevTotal, 0);
      const lost = analysisRows.reduce((s, r) => s + r.lostRevenue, 0);
      const contraction = analysisRows.reduce((s, r) => s + r.contractionRevenue, 0);
      const expansion = analysisRows.reduce((s, r) => s + r.expansionRevenue, 0);
      const added = analysisRows.reduce((s, r) => s + r.addedRevenue, 0);
      const end = analysisRows.reduce((s, r) => s + r.currentTotal, 0);
      const base = [0, start - lost, start - lost - contraction, start - lost - contraction + expansion, start - lost - contraction + expansion + added, 0];
      const visible = [start, -lost, -contraction, expansion, added, end];

      const waterfall = new ChartLib(waterfallRef.current!, {
        type: "bar",
        data: {
          labels: ["Mar revenue", "Lost customers", "Contraction", "Expansion", "New customers", "Apr revenue"],
          datasets: [
            { label: "base", data: base, backgroundColor: "rgba(0,0,0,0)", stack: "wf" },
            {
              label: "bridge",
              data: visible,
              stack: "wf",
              backgroundColor: [COLORS.blue, COLORS.red, COLORS.red, expansion > 0 ? COLORS.green : COLORS.gray, added > 0 ? COLORS.green : COLORS.gray, COLORS.blue],
              borderRadius: 4,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              filter: (item: { datasetIndex: number }) => item.datasetIndex !== 0,
              callbacks: { label: (ctx: { raw?: unknown }) => money0(Number(ctx.raw || 0), symbol) },
            },
          },
          scales: {
            x: { stacked: true, ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } },
            y: { stacked: true, ticks: { color: COLORS.tick, callback: (v: number | string) => axisYk(Number(v)) }, grid: { color: COLORS.grid } },
          },
        },
      });

      const team = new ChartLib(teamRef.current!, {
        type: "bar",
        data: {
          labels: data.teamRevenue.map((t) => t.team),
          datasets: [{ label: "Revenue", data: data.teamRevenue.map((t) => t.revenue), backgroundColor: COLORS.blue, borderRadius: 4 }],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: COLORS.tick, callback: (v: number | string) => `$${Number(v).toLocaleString("en-US")}` },
              grid: { color: COLORS.grid },
            },
            y: { ticks: { color: COLORS.tick, font: { size: 12 } }, grid: { display: false } },
          },
        },
      });

      return () => {
        growth.destroy();
        waterfall.destroy();
        team.destroy();
      };
    };

    let clean: (() => void) | undefined;
    loadChart().then((c) => (clean = c)).catch(() => undefined);
    return () => clean?.();
  }, [analysisRows, data, growthDatasets, metrics, symbol]);

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1>Revenue Analytics</h1>
            <p>Slicer-driven revenue growth · churn · team distribution</p>
          </div>
          <div className="actions">
            <Link href="/dashboard" className="btn btn-outline">← Dashboard</Link>
            <button className="btn btn-solid" type="button" onClick={fetchData}>{loading ? "Refreshing..." : "Refresh"}</button>
          </div>
        </header>

        <section className="w-full">
          <div className="max-w-[1200px] mx-auto">
            <div className="toolbar-row">
              <div className="toolbar-triggers">
                <MultiFilter id="month" label="Month" options={monthOptions} selected={months} setSelected={setMonths} mode={monthMode} setMode={setMonthMode} openKey={openFilter} setOpenKey={setOpenFilter} onApply={fetchData} />
                <MultiFilter id="company" label="Company" options={companyOptions} selected={companies} setSelected={setCompanies} mode={companyMode} setMode={setCompanyMode} openKey={openFilter} setOpenKey={setOpenFilter} onApply={fetchData} />
                <MultiFilter id="source" label="Source" options={sourceOptions} selected={sources} setSelected={setSources} mode={sourceMode} setMode={setSourceMode} openKey={openFilter} setOpenKey={setOpenFilter} onApply={fetchData} />
              </div>

              <div className="toolbar-actions-tight">
                <span className="rows-count">{data ? `${data.filteredCount} rows` : "— rows"}</span>
                <button className="clear-link" type="button" onClick={() => { setMonths([]); setCompanies([]); setSources([]); }}>
                  Clear All
                </button>
                <button className="toolbar-apply-btn" type="button" onClick={fetchData}>
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>

        {error ? <div className="error">{error}</div> : null}

        {data && metrics ? (
          <>
            <section className="kpi-grid">
              <article className="card kpi"><p className="muted">Total revenue (filtered)</p><h3 className="mono neutral">{money(metrics.total, 2, symbol)}</h3><p className="small neutral">{metrics.monthCount} months selected</p></article>
              <article className="card kpi"><p className="muted">Latest month revenue</p><h3 className="mono neutral">{money(metrics.latest, 2, symbol)}</h3><p className="small neg">{metrics.prev ? `${metrics.net < 0 ? "↓" : "↑"} ${Math.abs((metrics.net / metrics.prev) * 100).toFixed(1)}% vs prior month` : "—"}</p></article>
              <article className="card kpi"><p className="muted">Net revenue change</p><h3 className={`mono ${metrics.net < 0 ? "neg" : "pos"}`}>{money0(analysisSummary.net, symbol)}</h3><p className="small neg">Apr vs Mar</p></article>
              <article className="card kpi"><p className="muted">Churned revenue</p><h3 className="mono neutral">{money(metrics.lost, 2, symbol)}</h3><p className="small neutral">{metrics.lostCount} lost customers</p></article>
              <article className="card kpi"><p className="muted">Contraction (existing)</p><h3 className="mono neutral">{money(metrics.contraction, 2, symbol)}</h3><p className="small neutral">{metrics.contractionCount} customers shrank</p></article>
              <article className="card kpi"><p className="muted">New revenue added</p><h3 className="mono neutral">{money(analysisSummary.added, 2, symbol)}</h3><p className="small neutral">{metrics.added > 0 ? "New customers added" : "No new customers"}</p></article>
            </section>

            <div className="divider" />
            <section className="two-col">
              <article className="card"><h2>Revenue growth — monthly, by company</h2><p className="sub">Total revenue line + per-company breakdown</p><div className="chart-wrap h220"><canvas ref={growthRef} /></div><div className="legend">{growthDatasets.companyKeys.map((k, i) => <span key={k}><i style={{ background: i === 0 ? COLORS.blue : COLORS.green }} />{k}</span>)}<span><i style={{ background: COLORS.gray }} />Total</span></div></article>
              <article className="card"><h2>Revenue growth table</h2><p className="sub">Δ and Δ% per company per month (green = positive, red = negative)</p><div className="table-wrap"><table><thead><tr><th>Month</th><th>Company</th><th>Revenue</th><th>Δ</th><th>Δ%</th><th>Month total</th></tr></thead><tbody>{data.growthTable.map((r) => <tr key={`${r.month}-${r.company}`} className={latestMonth === r.month ? "tint-red" : ""}><td>{r.month}</td><td>{r.company}</td><td>{money0(r.revenue, symbol)}</td><td className={r.change >= 0 ? "pos" : "neg"}>{r.change >= 0 ? "+" : ""}{money0(r.change, symbol)}</td><td className={r.changePct >= 0 ? "pos" : "neg"}>{pct(r.changePct)}</td><td>{money0(r.totalRevenue, symbol)}</td></tr>)}</tbody></table></div></article>
            </section>

            <div className="divider" />
            <section>
              <h2 className="section-title">Churn & growth bridge</h2>
              <p className="section-sub">Click a row to inspect churn/lost/new/contraction versus that row&apos;s previous month.</p>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Company</th><th>Month</th><th>Prev total</th><th>Current total</th><th>Lost</th><th>Added</th><th>Existing net</th><th>Net Δ</th><th>Churn %</th><th>Growth %</th></tr></thead>
                    <tbody>
                      {data.churnVsGrowth.map((r) => {
                        const key = `${r.company}__${r.month}`;
                        return (
                          <tr
                            key={key}
                            className={`${latestMonth === r.month ? "tint-red" : ""} ${selectedChurnKey === key ? "active-row" : ""}`}
                            onClick={() => setSelectedChurnKey(key)}
                          >
                            <td>{r.company}</td><td>{r.month}</td><td>{money0(r.prevTotal, symbol)}</td><td>{money0(r.currentTotal, symbol)}</td>
                            <td className="neg">{money0(r.lostRevenue, symbol)}</td><td>{money0(r.addedRevenue, symbol)}</td>
                            <td className={r.existingCustomerDelta < 0 ? "neg" : "pos"}>{money0(r.existingCustomerDelta, symbol)}</td>
                            <td className={r.netRevenueDelta < 0 ? "neg" : "pos"}>{money0(r.netRevenueDelta, symbol)}</td>
                            <td>{r.churnRate > 0 ? <span className="badge-red">{pct(r.churnRate)}</span> : "0%"}</td><td className={r.growthRate < 0 ? "neg" : "pos"}>{pct(r.growthRate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
              <div className="mini-kpis">
                <article className="card mini"><p className="muted">Net change</p><h4 className="mono neg">{money0(analysisSummary.net, symbol)}</h4></article>
                <article className="card mini"><p className="muted">Lost (churned)</p><h4 className="mono neg">{money0(analysisSummary.lost, symbol)}</h4></article>
                <article className="card mini"><p className="muted">New added</p><h4 className="mono neutral">{money(analysisSummary.added, 2, symbol)}</h4></article>
                <article className="card mini"><p className="muted">Existing net</p><h4 className="mono neg">{money0(analysisSummary.existingNet, symbol)}</h4></article>
                <article className="card mini"><p className="muted">Existing contraction</p><h4 className="mono neg">{money0(analysisSummary.contraction, symbol)}</h4></article>
              </div>
            </section>

            <div className="divider" /><section><article className="card"><h2>Revenue waterfall — {selectedDetail?.prevMonth ?? "Prev"} → {selectedDetail?.month ?? latestMonth ?? "Current"}</h2><p className="sub">Visualizes how starting revenue flowed into ending revenue via churn, contraction, and expansion</p><div className="chart-wrap h240"><canvas ref={waterfallRef} /></div><div className="legend"><span><i style={{ background: COLORS.blue }} />Starting / ending revenue</span><span><i style={{ background: COLORS.red }} />Negative impact</span><span><i style={{ background: COLORS.green }} />Positive impact</span></div></article></section>

            <div className="divider" />
            <section className="two-col"><article className="card"><h2>Lost customers (previous month only)</h2><p className="sub">Compared period: {selectedDetail?.prevMonth ?? "previous"} → {selectedDetail?.month ?? latestMonth ?? "current"}</p><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Lost revenue</th><th>% of total loss</th></tr></thead><tbody>{lostCustomers.map((c) => <tr key={c.customer}><td>{c.customer}</td><td className="neg">{money(c.revenue, 2, symbol)}</td><td className="neutral">{analysisSummary.lost ? `${((c.revenue / analysisSummary.lost) * 100).toFixed(1)}%` : "0%"}</td></tr>)}</tbody></table></div></article>
            <article className="card"><h2>Existing customers — revenue contraction</h2><p className="sub">Present in both selected months — decreases in current period</p><div className="table-wrap"><table><thead><tr><th>Customer</th><th>{selectedDetail?.prevMonth ?? "Prev"}</th><th>{selectedDetail?.month ?? "Current"}</th><th>Δ</th></tr></thead><tbody>{contractionCustomers.map((c) => <tr key={c.customer}><td>{c.customer}</td><td>{money(c.mar, 2, symbol)}</td><td>{money(c.apr, 2, symbol)}</td><td className="neg">{money(c.delta, 2, symbol)}</td></tr>)}</tbody></table></div><div className="info-box"><p>{analysisSummary.expansion > 0 ? "Existing customer revenue increases found" : "No existing customer revenue increases this period"}</p><p className="mono">Expansion revenue: {money(analysisSummary.expansion, 2, symbol)}</p></div></article></section>

            <div className="divider" /><section><h2 className="section-title">Team revenue distribution</h2><p className="section-sub">Top customers by total revenue (filtered period)</p><article className="card"><div className="chart-wrap h320"><canvas ref={teamRef} /></div><p className="foot-note">Note: No &apos;Customer&apos; column in source data — using Team as customer label.</p></article></section>
          </>
        ) : null}
      </div>

      <style jsx>{`
      .page{background:${COLORS.bg};color:#e6e9ef;min-height:100vh;font-family:'DM Sans',sans-serif}.container{max-width:1320px;margin:0 auto;padding:28px 20px 44px}.header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}h1{font-size:48px;margin:0;font-weight:700}h2{margin:0 0 4px;font-size:20px}p{margin:0;color:rgba(255,255,255,.7)}.actions{display:flex;gap:10px;align-items:center}.btn{height:56px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:0 24px;text-decoration:none;border:1px solid ${COLORS.border};color:#fff;background:transparent;cursor:pointer;font-size:14px}.btn-solid{background:#185FA5;border-color:#185FA5;color:#B5D4F4}.btn-outline{background:transparent}.card{background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:16px}.toolbar-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:.5px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);backdrop-filter:blur(8px);padding:10px 12px;border-radius:16px}.toolbar-triggers{display:flex;align-items:center;gap:10px;flex:1;min-width:0}.toolbar-actions-tight{display:flex;align-items:center;gap:10px;flex-shrink:0}.toolbar-apply-btn{height:40px;padding:0 16px;border-radius:12px;border:0;background:#2563eb;color:#fff;font-size:14px;font-weight:600}.multi-filter{position:relative;min-width:210px}.multi-trigger{height:46px;width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;background:${COLORS.surface};color:#e9edf5;border:.5px solid rgba(255,255,255,.14);border-radius:12px;padding:0 14px;font-size:13px;white-space:nowrap;overflow:hidden}.multi-trigger > span:first-child{overflow:hidden;text-overflow:ellipsis}.chev{opacity:.7;color:#6ea4df}.multi-menu{position:absolute;width:340px;z-index:60;left:0;top:48px;background:#10131f;border:.5px solid rgba(255,255,255,.14);border-radius:14px;padding:10px;box-shadow:0 12px 28px rgba(0,0,0,.4)}.menu-top{display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:8px}.search{height:38px;width:100%;background:#0e1322;color:#f0f4f9;border:.5px solid rgba(255,255,255,.12);border-radius:10px;padding:0 12px}.mode{height:44px;background:#02071b;color:#fff;border:.5px solid rgba(255,255,255,.15);border-radius:16px;padding:0 14px}.menu-actions{display:flex;gap:8px;margin-bottom:8px}.mini-btn{height:34px;border:.5px solid rgba(255,255,255,.12);background:#1b2238;color:#fff;border-radius:10px;padding:0 12px;font-size:12px}.tip{font-size:13px;color:#9ca8bb;margin:8px 2px}.menu-list{max-height:190px;overflow:auto;padding-right:4px;border-top:.5px solid rgba(255,255,255,.1);padding-top:8px}.menu-divider{display:none}.menu-check{display:flex;gap:10px;align-items:center;font-size:13px;color:#e6e9ef;padding:7px 4px;border-radius:6px}.menu-check:hover{background:rgba(255,255,255,.05)}.menu-check input{accent-color:${COLORS.blue};width:20px;height:20px}.done-btn{width:100%;height:52px;margin-top:10px;border:.5px solid rgba(255,255,255,.12);background:#111a34;color:#fff;border-radius:16px;font-size:16px}.mode-head{font-size:12px;color:#9ba3b5;margin:2px 0 6px}.mode-radio{display:flex;gap:8px;margin-bottom:8px}.mode-radio label{display:flex;align-items:center;gap:6px;border:.5px solid rgba(255,255,255,.14);padding:6px 10px;border-radius:999px;background:#181d2d;color:#cbd5e6;font-size:12px}.mode-radio input{accent-color:#378ADD}.panel-actions{position:sticky;bottom:0;background:#10131f;display:flex;gap:8px;margin-top:10px;padding-top:8px;border-top:.5px solid rgba(255,255,255,.1)}.apply-mini{background:#2d67c6}.rows-count{font-size:12px;color:#9ea6b7}.clear-link{border:0;background:transparent;color:#c6ccd9;font-size:13px}.error{margin-top:10px;color:${COLORS.red}}.kpi-grid{margin-top:14px;display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.kpi .muted,.muted{font-size:12px;color:rgba(255,255,255,.55)}.kpi h3{margin:8px 0 7px;font-size:22px;font-weight:500}.mono{font-family:'DM Mono',monospace}.small{font-size:12px}.neg{color:${COLORS.red}}.pos{color:${COLORS.green}}.neutral{color:${COLORS.gray}}.divider{border-top:1px solid ${COLORS.border};margin:18px 0}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sub,.section-sub{font-size:13px;margin-bottom:12px;color:rgba(255,255,255,.6)}.section-title{margin:0}.chart-wrap{position:relative}.h220{height:220px}.h240{height:240px}.h320{height:320px}.legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;font-size:12px;color:rgba(255,255,255,.7)}.legend i{width:10px;height:10px;display:inline-block;border-radius:2px;margin-right:6px;vertical-align:middle}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-top:1px solid ${COLORS.border};white-space:nowrap}th{border-top:0;color:rgba(255,255,255,.55);font-size:12px;font-weight:500}.active-row td{background:rgba(55,138,221,.12)!important}.tint-red td{background:rgba(226,75,74,.05)}.badge-red{background:#FCEBEB;color:#A32D2D;border-radius:999px;font-size:12px;padding:3px 8px;font-weight:600}.mini-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px}.mini h4{margin:8px 0 0;font-size:20px;font-weight:500}.info-box{margin-top:12px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:10px;padding:10px}.foot-note{margin-top:10px;font-size:12px;color:rgba(255,255,255,.52)}
      @media (max-width:1120px){.kpi-grid{grid-template-columns:repeat(3,1fr)}.mini-kpis{grid-template-columns:1fr 1fr}.btn,.filter-right p,select,label span{font-size:14px}h1{font-size:36px}}
      @media (max-width:1024px){.toolbar-row{flex-wrap:wrap}.toolbar-actions-tight{width:100%;justify-content:flex-end}}@media (max-width:840px){.header{flex-direction:column;align-items:flex-start}.toolbar-triggers{flex-wrap:wrap}.multi-filter{min-width:100%}.toolbar-actions-tight{justify-content:space-between}.two-col,.kpi-grid,.mini-kpis{grid-template-columns:1fr}.btn{height:42px;padding:0 14px;font-size:14px}.done-btn{font-size:16px;height:42px}}
      `}</style>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&display=swap');`}</style>
    </main>
  );
}
