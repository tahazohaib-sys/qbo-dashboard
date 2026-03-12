// src/components/MonthlyChart.tsx
"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

type Row = { month: string; revenue: number; expenses: number; profit: number };

function fmtCompact(n: number, currency: string) {
  // CFO style: compact but readable
  const abs = Math.abs(n || 0);
  const unit =
    abs >= 1_000_000 ? 1_000_000 :
    abs >= 1_000 ? 1_000 :
    1;

  const suffix =
    unit === 1_000_000 ? "M" :
    unit === 1_000 ? "K" :
    "";

  const v = (n || 0) / unit;
  const rounded = Math.round(v);

  return `${rounded}${suffix} ${currency}`;
}

function TooltipBox({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1022] p-3 text-xs text-slate-100 shadow-lg">
      <div className="mb-2 font-semibold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span className="text-slate-300">{p.name}</span>
          <span className="font-medium">{new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(p.value || 0)}</span>
        </div>
      ))}
    </div>
  );
}

export default function MonthlyChart({
  title,
  data,
  mode,
  currency,
}: {
  title: string;
  data: Row[];
  mode: "rev-exp" | "profit";
  currency: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-400">Monthly (Jan → current month)</div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "rev-exp" ? (
            <BarChart data={data}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, currency)} />
              <Tooltip content={<TooltipBox currency={currency} />} />
              <Bar dataKey="revenue" name="Revenue" />
              <Bar dataKey="expenses" name="Expenses" />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, currency)} />
              <Tooltip content={<TooltipBox currency={currency} />} />
              <Line type="monotone" dataKey="profit" name="Profit" dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
