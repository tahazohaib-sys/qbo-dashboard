"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = { month: string; revenue: number; expenses: number };

function TooltipCard({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; name?: string; value?: number | string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const fm = (n: number) =>
    new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="glass-card rounded-xl px-3 py-2 text-xs text-slate-100">
      <div className="font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-1 flex items-center justify-between gap-4">
          <span className="text-slate-300">{p.name}</span>
          <span className="font-semibold">{fm(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export default function RevenueExpenseChart({ data, currency }: { data: Row[]; currency: string }) {
  return (
    <article className="glass-card rounded-[22px] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-100">Revenue & Expenses Trend</h3>
        <p className="text-xs text-slate-400">Monthly movement with smooth finance-grade curve</p>
      </div>

      <div className="h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="expFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" stroke="rgba(148,163,184,0.2)" />
            <XAxis dataKey="month" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "#cbd5e1", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round((Number(v) || 0) / 1000)}k`}
            />
            <Tooltip content={<TooltipCard currency={currency} />} />
            <Legend wrapperStyle={{ color: "#e2e8f0" }} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#8b5cf6" fill="url(#revFill)" strokeWidth={3} />
            <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#22d3ee" fill="url(#expFill)" strokeWidth={3} />
            <Line type="monotone" dataKey="revenue" stroke="#a78bfa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" stroke="#67e8f9" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
