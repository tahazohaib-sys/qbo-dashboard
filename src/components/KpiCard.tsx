// src/components/KpiCard.tsx
import React from "react";

export default function KpiCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const ring =
    tone === "good"
      ? "ring-emerald-400/25"
      : tone === "bad"
      ? "ring-rose-400/25"
      : "ring-sky-400/25";

  const dot =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "bad"
      ? "bg-rose-400"
      : "bg-sky-400";

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ${ring}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-300">{title}</div>
        <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-400">Accrual basis (QuickBooks)</div>
    </div>
  );
}
