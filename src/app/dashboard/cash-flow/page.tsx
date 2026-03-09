"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CashFlowHead = {
  head: string;
  inflow: number;
  outflow: number;
};

type CashFlowMonth = {
  month: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  heads: CashFlowHead[];
};

type CashFlowResp = {
  ok: boolean;
  start_date: string;
  end_date: string;
  accountCount: number;
  accounts: Array<{ id: string; name: string }>;
  months: CashFlowMonth[];
  error?: string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatPKR(n: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export default function CashFlowPage() {
  const [startDate, setStartDate] = useState(ymd(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1)));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CashFlowResp | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);

      const sp = new URLSearchParams({ start_date: startDate, end_date: endDate });
      const res = await fetch(`/api/qbo/cash-flow?${sp.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as CashFlowResp;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load cash flow");
      }
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(
    () => (data?.months ?? []).map((m) => ({ month: m.month, Inflow: m.inflow, Outflow: m.outflow })),
    [data?.months]
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Cash Flow Module</h1>
            <p className="text-sm text-slate-300">Monthly consolidated inflow/outflow from all cash & bank ledgers.</p>
          </div>
          <Link href="/dashboard" className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
            Back to Dashboard
          </Link>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-300">Start date</span>
              <input type="date" className="rounded-md bg-slate-900 px-2 py-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-300">End date</span>
              <input type="date" className="rounded-md bg-slate-900 px-2 py-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <button onClick={load} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
              Refresh
            </button>
          </div>
        </div>

        {loading ? <div className="mt-4">Loading...</div> : null}
        {error ? <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-rose-200">{error}</div> : null}

        {data && !loading ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">Accounts included</div>
                <div className="mt-1 text-2xl font-bold">{data.accountCount}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">Total inflow ({data.months.length} months)</div>
                <div className="mt-1 text-2xl font-bold text-emerald-300">{formatPKR(data.months.reduce((sum, m) => sum + m.inflow, 0))}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-300">Total outflow ({data.months.length} months)</div>
                <div className="mt-1 text-2xl font-bold text-rose-300">{formatPKR(data.months.reduce((sum, m) => sum + m.outflow, 0))}</div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-3 text-lg font-semibold">Monthly Growth Chart (Inflow vs Outflow)</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: any) => formatPKR(Number(v || 0))} />
                    <Legend />
                    <Line type="monotone" dataKey="Inflow" stroke="#34d399" strokeWidth={2} />
                    <Line type="monotone" dataKey="Outflow" stroke="#fb7185" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {data.months.map((m) => (
                <div key={m.month} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{m.month}</h3>
                    <div className="text-sm text-slate-300">
                      Inflow: <span className="font-semibold text-emerald-300">{formatPKR(m.inflow)}</span> · Outflow: <span className="font-semibold text-rose-300">{formatPKR(m.outflow)}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-300">
                        <tr>
                          <th className="py-2 pr-3">Account Head</th>
                          <th className="py-2 text-right">Inflow</th>
                          <th className="py-2 text-right">Outflow</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.heads.map((h) => (
                          <tr key={`${m.month}-${h.head}`} className="border-t border-white/10">
                            <td className="py-2 pr-3">{h.head}</td>
                            <td className="py-2 text-right text-emerald-300">{h.inflow ? formatPKR(h.inflow) : "-"}</td>
                            <td className="py-2 text-right text-rose-300">{h.outflow ? formatPKR(h.outflow) : "-"}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/20 bg-white/5 font-semibold">
                          <td className="py-2 pr-3">Monthly Total</td>
                          <td className="py-2 text-right text-emerald-300">{formatPKR(m.inflow)}</td>
                          <td className="py-2 text-right text-rose-300">{formatPKR(m.outflow)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
