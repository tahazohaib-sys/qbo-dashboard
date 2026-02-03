"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type ApiSeriesRow = {
  month: string; // YYYY-MM
  revenue: number;
  expenses: number;
  profit: number;
};

type ApiData = {
  ok: boolean;
  companyName: string;
  currency: string; // "PKR"
  asOf: string; // ISO
  accounting_method: "Accrual" | "Cash";
  series: ApiSeriesRow[];
  kpis: {
    mtd: { revenue: number; expenses: number; profit: number };
    ytd: { revenue: number; expenses: number; profit: number };
  };
  error?: string;
};

function fmtMoney(n: number, currency = "PKR") {
  const v = Number.isFinite(n) ? n : 0;
  // no decimals, commas
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtMonthLabel(yyyyMm: string) {
  // "2026-01" -> "Jan"
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "short" });
}

function fmtAsOf(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PK", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardClient() {
  const [data, setData] = React.useState<ApiData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = (await res.json()) as ApiData;

      if (!json.ok) {
        setData(null);
        setErr(json.error || "Dashboard API error");
        return;
      }

      setData(json);
    } catch (e: any) {
      setData(null);
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  const companyName = data?.companyName ?? "QuickBooks Online";
  const currency = data?.currency ?? "PKR";
  const asOf = data?.asOf ? fmtAsOf(data.asOf) : "—";

  const series = (data?.series ?? []).map((r) => ({
    ...r,
    monthLabel: fmtMonthLabel(r.month),
  }));

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-200">
            <span className="font-medium">Company:</span> {companyName}{" "}
            <span className="text-slate-400">({currency})</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-300">
              <span className="font-medium text-slate-200">As of:</span> {asOf}
            </div>

            <button
              onClick={load}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/15"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 text-sm text-slate-300">Loading dashboard…</div>
        )}

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="text-sm font-semibold text-red-200">Dashboard API Error</div>
            <div className="mt-1 text-sm text-red-200">{err}</div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-slate-400">MTD Revenue</div>
          <div className="mt-2 text-2xl font-semibold">
            {fmtMoney(data?.kpis?.mtd?.revenue ?? 0, currency)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-slate-400">MTD Expenses</div>
          <div className="mt-2 text-2xl font-semibold">
            {fmtMoney(data?.kpis?.mtd?.expenses ?? 0, currency)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xs text-slate-400">MTD Profit</div>
          <div className="mt-2 text-2xl font-semibold">
            {fmtMoney(data?.kpis?.mtd?.profit ?? 0, currency)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue vs Expenses */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-base font-semibold">Monthly Revenue vs Expenses</div>
          <div className="mt-1 text-sm text-slate-400">Monthly (Jan → current month)</div>

          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fill: "#cbd5e1" }} />
                <YAxis
                  tick={{ fill: "#cbd5e1" }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(v as number)
                  }
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    fmtMoney(Number(value || 0), currency),
                    String(name),
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Legend />
                <Line type="monotone" dataKey="revenue" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-base font-semibold">Monthly Profit</div>
          <div className="mt-1 text-sm text-slate-400">Monthly (Jan → current month)</div>

          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fill: "#cbd5e1" }} />
                <YAxis
                  tick={{ fill: "#cbd5e1" }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(v as number)
                  }
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    fmtMoney(Number(value || 0), currency),
                    String(name),
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Legend />
                <Line type="monotone" dataKey="profit" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* YTD Summary */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-base font-semibold">YTD Summary</div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400">YTD Revenue</div>
            <div className="mt-1 text-lg font-semibold">
              {fmtMoney(data?.kpis?.ytd?.revenue ?? 0, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">YTD Expenses</div>
            <div className="mt-1 text-lg font-semibold">
              {fmtMoney(data?.kpis?.ytd?.expenses ?? 0, currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">YTD Profit</div>
            <div className="mt-1 text-lg font-semibold">
              {fmtMoney(data?.kpis?.ytd?.profit ?? 0, currency)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
