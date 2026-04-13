"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

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

const money = (n: number, decimals = 0) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const axisYk = (value: number) => {
  const v = Math.round(Math.abs(value) / 1000);
  return `${value < 0 ? "-" : ""}$${v}k`;
};

export default function RevenueAnalyticsPageClient() {
  const growthRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<HTMLCanvasElement | null>(null);
  const teamRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!growthRef.current || !waterfallRef.current || !teamRef.current) return;

    const growthChart = new Chart(growthRef.current, {
      type: "line",
      data: {
        labels: ["2026/03", "2026/04"],
        datasets: [
          {
            label: "RTC League",
            data: [15028, 2571],
            borderColor: COLORS.blue,
            backgroundColor: "rgba(55,138,221,0.08)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
          {
            label: "Stratager AI",
            data: [3100, 482],
            borderColor: COLORS.green,
            backgroundColor: "rgba(99,153,34,0.08)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
          {
            label: "Total",
            data: [18128, 3054],
            borderColor: COLORS.gray,
            borderDash: [5, 3],
            fill: false,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: COLORS.tick },
            grid: { color: COLORS.grid },
          },
          y: {
            ticks: {
              color: COLORS.tick,
              callback: (v) => axisYk(Number(v)),
            },
            grid: { color: COLORS.grid },
          },
        },
      },
    });

    const waterfallChart = new Chart(waterfallRef.current, {
      type: "bar",
      data: {
        labels: ["Mar revenue", "Lost customers", "Contraction", "Expansion", "New customers", "Apr revenue"],
        datasets: [
          {
            label: "base",
            data: [0, 14671, 3054, 3054, 3054, 0],
            backgroundColor: "rgba(0,0,0,0)",
            borderWidth: 0,
            stack: "wf",
          },
          {
            label: "Revenue bridge",
            data: [18128, -3466, -11609, 0, 0, 3054],
            stack: "wf",
            backgroundColor: [COLORS.blue, COLORS.red, COLORS.red, COLORS.gray, COLORS.gray, COLORS.blue],
            borderRadius: 4,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return "";
                return money(Number(ctx.raw ?? 0));
              },
            },
            filter: (item) => item.datasetIndex !== 0,
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } },
          y: {
            stacked: true,
            ticks: {
              color: COLORS.tick,
              callback: (v) => axisYk(Number(v)),
            },
            grid: { color: COLORS.grid },
          },
        },
      },
    });

    const teamChart = new Chart(teamRef.current, {
      type: "bar",
      data: {
        labels: [
          "ICG America, Inc.",
          "Snippet Digital",
          "Merlin Digital Solutions GmbH",
          "Comora Group",
          "Triton Communications",
          "Brimy",
          "Moppity Vineyards",
          "ThriveLink (formerly Nutrible)",
          "GoStats",
          "Laurence Fish",
        ],
        datasets: [
          {
            label: "Revenue",
            data: [10208, 3000, 2565, 2121, 1864, 400, 297, 225, 190, 129],
            backgroundColor: COLORS.blue,
            borderRadius: 4,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              color: COLORS.tick,
              callback: (v) => `$${Number(v).toLocaleString("en-US")}`,
            },
            grid: { color: COLORS.grid },
          },
          y: {
            ticks: { color: COLORS.tick, font: { size: 12 } },
            grid: { display: false },
          },
        },
      },
    });

    return () => {
      growthChart.destroy();
      waterfallChart.destroy();
      teamChart.destroy();
    };
  }, []);

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <h1>Revenue Analytics</h1>
            <p>Slicer-driven revenue growth · churn · team distribution</p>
          </div>
          <div className="actions">
            <Link href="/dashboard" className="btn btn-outline">
              ← Dashboard
            </Link>
            <button className="btn btn-solid" type="button">
              Refresh
            </button>
          </div>
        </header>

        <section className="card filter-bar">
          <div className="filters">
            <label>
              <span>Month</span>
              <select multiple defaultValue={["2026/03", "2026/04"]}>
                <option>All</option>
                <option>2026/03</option>
                <option>2026/04</option>
              </select>
            </label>
            <label>
              <span>Company</span>
              <select defaultValue="All">
                <option>All</option>
                <option>RTC League</option>
                <option>Stratager AI</option>
              </select>
            </label>
            <label>
              <span>Source</span>
              <select defaultValue="All">
                <option>All</option>
              </select>
            </label>
          </div>
          <div className="filter-right">
            <p>15 rows filtered (from 97)</p>
            <button className="btn btn-solid" type="button">
              Apply
            </button>
          </div>
        </section>

        <section className="kpi-grid">
          {[
            ["Total revenue (filtered)", "$21,181.50", "2 months selected", "neutral"],
            ["Latest month revenue", "$3,053.56", "↓ 83.2% vs prior month", "neg"],
            ["Net revenue change", "-$15,074", "Apr vs Mar", "neg"],
            ["Churned revenue", "$3,465.64", "5 lost customers", "neutral"],
            ["Contraction (existing)", "$11,608.74", "3 customers shrank", "neutral"],
            ["New revenue added", "$0.00", "No new customers", "neutral"],
          ].map(([label, value, sub, tone]) => (
            <article className="card kpi" key={label}>
              <p className="muted">{label}</p>
              <h3 className={tone === "neg" ? "neg mono" : tone === "pos" ? "pos mono" : "neutral mono"}>{value}</h3>
              <p className={tone === "neg" ? "neg small" : "small neutral"}>{sub}</p>
            </article>
          ))}
        </section>

        <div className="divider" />

        <section className="two-col">
          <article className="card">
            <h2>Revenue growth — monthly, by company</h2>
            <p className="sub">Total revenue line + per-company breakdown</p>
            <div className="chart-wrap h220">
              <canvas ref={growthRef} />
            </div>
            <div className="legend">
              <span><i style={{ background: COLORS.blue }} />RTC League</span>
              <span><i style={{ background: COLORS.green }} />Stratager AI</span>
              <span><i style={{ background: COLORS.gray }} />Total</span>
            </div>
          </article>

          <article className="card">
            <h2>Revenue growth table</h2>
            <p className="sub">Δ and Δ% per company per month (green = positive, red = negative)</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th>Company</th><th>Revenue</th><th>Δ</th><th>Δ%</th><th>Month total</th></tr></thead>
                <tbody>
                  <tr><td>2026/03</td><td>RTC League</td><td>$15,028</td><td className="pos">+$15,028</td><td>—</td><td>$18,128</td></tr>
                  <tr><td>2026/03</td><td>Stratager AI</td><td>$3,100</td><td className="pos">+$3,100</td><td>—</td><td>$18,128</td></tr>
                  <tr className="tint-red"><td>2026/04</td><td>RTC League</td><td>$2,571</td><td className="neg">-$12,457</td><td className="neg">-82.9%</td><td>$3,054</td></tr>
                  <tr className="tint-red"><td>2026/04</td><td>Stratager AI</td><td>$482</td><td className="neg">-$2,618</td><td className="neg">-84.4%</td><td>$3,054</td></tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <div className="divider" />

        <section>
          <h2 className="section-title">Churn & growth bridge</h2>
          <p className="section-sub">Click a row to see detail — lost/new customers + expansion/contraction from existing</p>
          <article className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Company</th><th>Month</th><th>Prev total</th><th>Current total</th><th>Lost</th><th>Added</th><th>Existing net</th><th>Net Δ</th><th>Churn %</th><th>Growth %</th></tr></thead>
                <tbody>
                  <tr><td>RTC League</td><td>2026/03</td><td>$0</td><td>$15,028</td><td>$0</td><td>$0</td><td>$0</td><td className="pos">+$15,028</td><td>0%</td><td>—</td></tr>
                  <tr><td>Stratager AI</td><td>2026/03</td><td>$0</td><td>$3,100</td><td>$0</td><td>$0</td><td>$0</td><td className="pos">+$3,100</td><td>0%</td><td>—</td></tr>
                  <tr className="tint-red"><td>RTC League</td><td>2026/04</td><td>$15,028</td><td>$2,571</td><td className="neg">$2,962</td><td>$0</td><td className="neg">-$9,495</td><td className="neg">-$12,457</td><td><span className="badge-red">19.7%</span></td><td className="neg">-82.9%</td></tr>
                  <tr className="tint-red"><td>Stratager AI</td><td>2026/04</td><td>$3,100</td><td>$482</td><td className="neg">$504</td><td>$0</td><td className="neg">-$2,114</td><td className="neg">-$2,618</td><td><span className="badge-red">16.3%</span></td><td className="neg">-84.4%</td></tr>
                </tbody>
              </table>
            </div>
          </article>

          <div className="mini-kpis">
            {["Net change|- $15,075|neg", "Lost (churned)|$3,466|neg", "New added|$0.00|neutral", "Existing net|-$11,609|neg", "Existing contraction|$11,609|neg"].map((row) => {
              const [label, value, tone] = row.split("|");
              return (
                <article className="card mini" key={label}>
                  <p className="muted">{label}</p>
                  <h4 className={`mono ${tone}`}>{value.replace("- ", "-")}</h4>
                </article>
              );
            })}
          </div>
        </section>

        <div className="divider" />

        <section>
          <article className="card">
            <h2>Revenue waterfall — Mar → Apr 2026</h2>
            <p className="sub">Visualizes how starting revenue flowed into ending revenue via churn, contraction, and expansion</p>
            <div className="chart-wrap h240"><canvas ref={waterfallRef} /></div>
            <div className="legend">
              <span><i style={{ background: COLORS.blue }} />Starting / ending revenue</span>
              <span><i style={{ background: COLORS.red }} />Negative impact</span>
              <span><i style={{ background: COLORS.green }} />Positive impact</span>
            </div>
          </article>
        </section>

        <div className="divider" />

        <section className="two-col">
          <article className="card">
            <h2>Lost customers (previous month only)</h2>
            <p className="sub">Present in Mar 2026 — missing in Apr 2026</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Lost revenue</th><th>% of total loss</th></tr></thead>
                <tbody>
                  <tr><td>Comora Group</td><td className="neg">$2,121.43</td><td className="neutral">43.6%</td></tr>
                  <tr><td>Moppity Vineyards</td><td className="neg">$297.00</td><td className="neutral">6.1%</td></tr>
                  <tr><td>ThriveLink (formerly Nutrible)</td><td className="neg">$225.00</td><td className="neutral">4.6%</td></tr>
                  <tr><td>GoStats</td><td className="neg">$189.64</td><td className="neutral">3.9%</td></tr>
                  <tr><td>Laurence Fish</td><td className="neg">$128.57</td><td className="neutral">2.6%</td></tr>
                </tbody>
              </table>
            </div>
          </article>

          <article className="card">
            <h2>Existing customers — revenue contraction</h2>
            <p className="sub">Present in both months — revenue decreased in Apr 2026</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Mar</th><th>Apr</th><th>Δ</th></tr></thead>
                <tbody>
                  <tr><td>ICG America, Inc.</td><td>$8,922.86</td><td>$1,285.71</td><td className="neg">-$7,637.15</td></tr>
                  <tr><td>Merlin Digital Solutions GmbH</td><td>$2,179.29</td><td>$385.71</td><td className="neg">-$1,793.58</td></tr>
                  <tr><td>Triton Communications</td><td>$964.29</td><td>$900.00</td><td className="neg">-$64.29</td></tr>
                </tbody>
              </table>
            </div>
            <div className="info-box">
              <p>No existing customer revenue increases this period</p>
              <p className="mono">Expansion revenue: $0.00</p>
            </div>
          </article>
        </section>

        <div className="divider" />

        <section>
          <h2 className="section-title">Team revenue distribution</h2>
          <p className="section-sub">Top customers by total revenue (filtered period)</p>
          <article className="card">
            <div className="chart-wrap h320"><canvas ref={teamRef} /></div>
            <p className="foot-note">Note: No &apos;Customer&apos; column in source data — using Team as customer label.</p>
          </article>
        </section>
      </div>

      <style jsx>{`
        .page { background: ${COLORS.bg}; color: #e6e9ef; min-height: 100vh; font-family: 'DM Sans', sans-serif; }
        .container { max-width: 1320px; margin: 0 auto; padding: 28px 20px 44px; }
        :global(head) {}
        .header { display: flex; justify-content: space-between; gap: 14px; align-items: flex-end; margin-bottom: 18px; }
        h1 { font-size: 36px; margin: 0; font-weight: 700; }
        h2 { margin: 0 0 4px; font-size: 20px; }
        p { margin: 0; color: rgba(255,255,255,0.7); }
        .actions { display: flex; gap: 10px; }
        .btn { border-radius: 999px; padding: 9px 14px; text-decoration: none; border: 1px solid ${COLORS.border}; color: #fff; background: transparent; cursor: pointer; }
        .btn-outline { background: transparent; }
        .btn-solid { background: ${COLORS.blue}; border-color: ${COLORS.blue}; }
        .card { background: ${COLORS.card}; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 16px; }
        .filter-bar { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
        .filters { display: grid; grid-template-columns: repeat(3, minmax(160px,1fr)); gap: 12px; width: 100%; }
        label span { font-size: 12px; color: rgba(255,255,255,0.65); display:block; margin-bottom: 6px; }
        select { width: 100%; background: ${COLORS.surface}; color: #fff; border: 1px solid ${COLORS.border}; border-radius: 999px; padding: 10px 12px; }
        select[multiple] { border-radius: 12px; min-height: 84px; }
        .filter-right { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
        .kpi-grid { margin-top: 14px; display:grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
        .kpi .muted, .muted { font-size: 12px; color: rgba(255,255,255,0.55); }
        .kpi h3 { margin: 8px 0 7px; font-size: 22px; font-weight: 500; }
        .mono { font-family: 'DM Mono', monospace; }
        .small { font-size: 12px; }
        .neg { color: ${COLORS.red}; }
        .pos { color: ${COLORS.green}; }
        .neutral { color: ${COLORS.gray}; }
        .divider { border-top: 1px solid ${COLORS.border}; margin: 18px 0; }
        .two-col { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .sub, .section-sub { font-size: 13px; margin-bottom: 12px; color: rgba(255,255,255,0.6); }
        .section-title { margin: 0; }
        .chart-wrap { position: relative; }
        .h220 { height: 220px; }
        .h240 { height: 240px; }
        .h320 { height: 320px; }
        .legend { display:flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; font-size: 12px; color: rgba(255,255,255,0.7); }
        .legend i { width: 10px; height: 10px; display: inline-block; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
        .table-wrap { overflow-x: auto; }
        table { width:100%; border-collapse: collapse; font-size: 14px; }
        th, td { text-align: left; padding: 10px 10px; border-top: 1px solid ${COLORS.border}; white-space: nowrap; }
        th { border-top: 0; color: rgba(255,255,255,0.55); font-size: 12px; font-weight: 500; }
        .tint-red td { background: rgba(226,75,74,0.05); }
        .badge-red { background:#FCEBEB; color:#A32D2D; border-radius: 999px; font-size: 12px; padding: 3px 8px; font-weight: 600; }
        .mini-kpis { display:grid; grid-template-columns: repeat(5,1fr); gap: 10px; margin-top: 12px; }
        .mini h4 { margin: 8px 0 0; font-size: 20px; font-weight: 500; }
        .info-box { margin-top: 12px; background: ${COLORS.surface}; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 10px; }
        .foot-note { margin-top: 10px; font-size: 12px; color: rgba(255,255,255,0.52); }

        @media (max-width: 1120px) {
          .kpi-grid { grid-template-columns: repeat(3,1fr); }
          .mini-kpis { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 840px) {
          .header { flex-direction: column; align-items: flex-start; }
          .filter-bar { flex-direction: column; align-items: stretch; }
          .filters { grid-template-columns: 1fr; }
          .filter-right { justify-content: space-between; }
          .two-col { grid-template-columns: 1fr; }
          .kpi-grid { grid-template-columns: 1fr; }
          .mini-kpis { grid-template-columns: 1fr; }
        }
      `}</style>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700&display=swap');
      `}</style>
    </main>
  );
}
