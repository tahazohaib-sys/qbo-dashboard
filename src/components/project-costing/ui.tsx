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
      className={`relative overflow-hidden rounded-3xl border border-white/[0.09] bg-[linear-gradient(160deg,rgba(255,255,255,0.075),rgba(255,255,255,0.02)_40%,rgba(255,255,255,0.01))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
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

const ICONS: Record<string, React.ReactNode> = {
  revenue: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  cost: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  contribution: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 10l3-3 3 3" />
    </>
  ),
  margin: <path d="M19 5L5 19M7.5 6.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM19.5 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-2.5-5.1" />
    </>
  ),
  bench: (
    <>
      <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />,
};

export type KpiIcon = keyof typeof ICONS;

export function Kpi({
  label,
  value,
  sub,
  accent,
  icon,
  delta,
  deltaGoodWhenUp = true,
  children,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  accent: string;
  icon?: KpiIcon;
  /** Change from the previous month in %, or in points. */
  delta?: { value: number; unit: "%" | "pts" } | null;
  deltaGoodWhenUp?: boolean;
  children?: React.ReactNode;
}) {
  const flat = delta ? Math.abs(delta.value) < 0.05 : false;
  const good = delta ? (delta.value >= 0) === deltaGoodWhenUp : true;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[linear-gradient(150deg,rgba(255,255,255,0.08),rgba(255,255,255,0.015))] p-4 shadow-[0_16px_44px_rgba(2,6,23,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-300 hover:-translate-y-0.5 hover:border-white/20">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl transition group-hover:opacity-50" style={{ background: accent }} />
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent 70%)` }} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
        {icon ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10"
            style={{ background: `linear-gradient(135deg, ${accent}55, ${accent}18)`, color: "#fff", boxShadow: `0 6px 18px ${accent}40` }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {ICONS[icon]}
            </svg>
          </span>
        ) : null}
      </div>
      <div className="relative mt-1.5 text-[24px] font-semibold tracking-tight text-white tabular-nums">{value}</div>
      <div className="relative mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
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
      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}

/** SVG gradients for chart fills: url(#pc-<name>-v) vertical, url(#pc-<name>-h) horizontal. */
export function ChartGradients() {
  const list: Array<[string, string]> = [
    ["revenue", C.revenue],
    ["cost", C.cost],
    ["contribution", C.contribution],
    ["negative", C.negative],
    ["violet", "#9085e9"],
  ];
  return (
    <defs>
      {list.map(([name, color]) => (
        <React.Fragment key={name}>
          <linearGradient id={`pc-${name}-v`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`pc-${name}-h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
          <linearGradient id={`pc-${name}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </React.Fragment>
      ))}
    </defs>
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
