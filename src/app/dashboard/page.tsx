"use client";

import React from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import DashboardShell from "@/components/dashboard/DashboardShell";
import KpiCards from "@/components/dashboard/KpiCards";
import RevenueExpenseChart from "@/components/dashboard/RevenueExpenseChart";
import QuickTransactions from "@/components/dashboard/QuickTransactions";
import RecentActivities from "@/components/dashboard/RecentActivities";

type ApiSeriesRow = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

type ApiData = {
  ok: boolean;
  companyName: string;
  currency: string;
  asOf: string;
  series: ApiSeriesRow[];
  kpis: {
    mtd: { revenue: number; expenses: number; profit: number };
    ytd: { revenue: number; expenses: number; profit: number };
  };
  error?: string;
};

function fmtMoney(n: number, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

function monthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

export default function DashboardPage() {
  const [data, setData] = React.useState<ApiData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = (await res.json()) as ApiData;
      if (!json.ok) throw new Error(json.error || "Failed to load dashboard");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const currency = data?.currency ?? "PKR";
  const series = (data?.series ?? []).map((row) => ({
    ...row,
    monthLabel: monthLabel(row.month),
  }));

  const kpis = [
    {
      title: "Balance",
      value: fmtMoney(data?.kpis?.mtd?.revenue ?? 0, currency),
      note: "Monthly revenue",
      progress: 70,
    },
    {
      title: "Withdrawal",
      value: fmtMoney(data?.kpis?.mtd?.expenses ?? 0, currency),
      note: "Monthly expenses",
      progress: 48,
    },
    {
      title: "Profits",
      value: fmtMoney(data?.kpis?.mtd?.profit ?? 0, currency),
      note: "Monthly net",
      progress: data?.kpis?.mtd?.revenue ? (data.kpis.mtd.profit / data.kpis.mtd.revenue) * 100 : 0,
    },
  ];

  const activities = (series.slice(-5).reverse() ?? []).map((row, idx) => ({
    id: `${row.month}-${idx}`,
    name: idx % 2 === 0 ? "Finance Team" : "Accounts Desk",
    role: idx % 2 === 0 ? "Controller" : "Analyst",
    message: `${row.monthLabel}: Profit ${fmtMoney(row.profit, currency)} recorded.`,
    time: `${idx + 1}h ago`,
  }));

  const quickTxns = (series.slice(-6).reverse() ?? []).map((row) => ({
    id: row.month,
    label: `${row.monthLabel} revenue move`,
    amount: fmtMoney(row.revenue, currency),
    time: row.month,
  }));

  const orderData = series.slice(-8).map((row) => ({
    month: row.monthLabel,
    value: Math.max(0, row.profit),
  }));

  const revenue = data?.kpis?.ytd?.revenue ?? 0;
  const profit = data?.kpis?.ytd?.profit ?? 0;
  const gaugePct = revenue > 0 ? Math.max(0, Math.min(100, (profit / revenue) * 100)) : 45;
  const gaugeData = [
    { name: "value", value: gaugePct },
    { name: "rest", value: 100 - gaugePct },
  ];

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={`${data?.companyName ?? "Finance Overview"} · ${loading ? "Refreshing…" : "Live snapshot"}`}
      rightRail={
        <>
          <div className="glass-card rounded-[22px] p-5">
            <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-b from-violet-400/70 to-cyan-400/70" />
            <h3 className="mt-3 text-center text-lg font-semibold text-slate-100">{data?.companyName ?? "Finance Team"}</h3>
            <p className="text-center text-xs text-slate-400">Financial Operations</p>
            <button
              onClick={load}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-white/15"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <RecentActivities items={activities} />
        </>
      }
    >
      {error ? <div className="glass-card rounded-[20px] border-rose-400/30 p-4 text-sm text-rose-200">{error}</div> : null}

      <KpiCards items={kpis} />

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <RevenueExpenseChart data={series.map((x) => ({ month: x.monthLabel, revenue: x.revenue, expenses: x.expenses }))} currency={currency} />

        <article className="glass-card rounded-[22px] p-4">
          <h3 className="text-base font-semibold text-slate-100">Profits Chart</h3>
          <p className="text-xs text-slate-400">Net trend overview</p>
          <div className="mt-3 space-y-2">
            {series.slice(-6).map((row) => (
              <div key={row.month} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-xs text-slate-300">{row.monthLabel}</span>
                <span className="text-sm font-semibold tabular-nums text-right text-slate-100">{fmtMoney(row.profit, currency)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="glass-card rounded-[22px] p-4">
          <h3 className="text-base font-semibold text-slate-100">Order</h3>
          <p className="text-xs text-slate-400">Mini profit bars</p>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderData}>
                <Tooltip formatter={(v: number | string | undefined) => fmtMoney(Number(v ?? 0), currency)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {orderData.map((_, i) => (
                    <Cell key={i} fill={i % 2 ? "#8b5cf6" : "#22d3ee"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="glass-card rounded-[22px] p-4">
          <h3 className="text-base font-semibold text-slate-100">Earnings</h3>
          <p className="text-xs text-slate-400">YTD profit ratio</p>
          <div className="relative mt-4 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={50}
                  outerRadius={68}
                  stroke="none"
                >
                  <Cell fill="#8b5cf6" />
                  <Cell fill="rgba(148,163,184,0.22)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pt-6 text-2xl font-semibold text-slate-100">{Math.round(gaugePct)}%</div>
          </div>
        </article>

        <QuickTransactions items={quickTxns} />
      </div>
    </DashboardShell>
  );
}
