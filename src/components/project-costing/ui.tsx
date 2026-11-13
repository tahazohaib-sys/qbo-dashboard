"use client";

// Shared look for the Project Costing pages: colors, number formats, cards and chart tooltip.
import React from "react";

/** Chart colors (dark surface). Each color has one job and keeps it in all charts. */
export const C = {
  revenue: "#3987e5", // blue
  cost: "#d95926", // orange
  contribution: "#199e70", // aqua
  negative: "#e66767", // red
  partial: "#c98500", // yellow
  neutral: "#5b6478", // gray (not allocated)
  grid: "rgba(148,163,184,0.12)",
  axis: "#8a94a8",
};

export const fmtPkr = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n < 0 ? "-" : ""}Rs ${Math.round(Math.abs(n)).toLocaleString("en")}`;

export const fmtUsd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en")}`;

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`;

/** Short amount for axes and labels: Rs 1.25M, Rs 820K. */
export function fmtShort(n: number | null | undefined, prefix = "Rs ") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${prefix}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${prefix}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${prefix}${(a / 1e3).toFixed(0)}K`;
  return `${sign}${prefix}${Math.round(a)}`;
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur-xl ${className}`}
    >
      {title || right ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  sub,
  accent,
  delta,
  deltaGoodWhenUp = true,
  children,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  accent: string;
  /** Change from the previous month in %, or in points when deltaUnit is "pts". */
  delta?: { value: number; unit: "%" | "pts" } | null;
  deltaGoodWhenUp?: boolean;
  children?: React.ReactNode;
}) {
  const flat = delta ? Math.abs(delta.value) < 0.05 : false;
  const good = delta ? (delta.value >= 0) === deltaGoodWhenUp : true;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.07] to-white/[0.015] p-4 shadow-[0_14px_40px_rgba(2,6,23,0.4)]">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {label}
      </div>
      <div className="mt-2 text-[22px] font-semibold tracking-tight text-white tabular-nums">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {delta && Number.isFinite(delta.value) ? (
          <span
            className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${
              flat ? "bg-white/10 text-slate-300" : good ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {flat ? "■" : delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(1)}
            {delta.unit === "%" ? "%" : " pts"}
          </span>
        ) : null}
        {sub}
      </div>
      {children}
    </div>
  );
}

export function LegendRow({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

type TipEntry = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };
export type TipProps = { active?: boolean; label?: string | number; payload?: TipEntry[] };

/** Dark tooltip for all charts. format: how to show each value. */
export function ChartTip({
  active,
  label,
  payload,
  format = (v: number) => fmtPkr(v),
}: TipProps & { format?: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-xl border border-white/15 bg-[#0b1224]/95 px-3 py-2 text-xs shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur">
      {label !== undefined && label !== "" ? <div className="mb-1.5 font-semibold text-white">{label}</div> : null}
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums text-white">{format(Number(p.value), String(p.dataKey ?? ""))}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: "unallocated" | "partial" }) {
  return status === "partial" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
      Partial
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/20 bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
      <span className="h-1.5 w-1.5 rounded-full border border-slate-300" />
      Not allocated
    </span>
  );
}
