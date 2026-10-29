"use client";

import React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MoneyProvider, useMoneyCurrency } from "@/components/CurrencyFilter";
import { moneyPrefix } from "@/lib/currency";
import { buildInsights, buildVerdict, type Components } from "@/lib/retained-earning";

/* ---------------- types (subset of /api/qbo/retained-earning) ---------------- */

type Insight = { tone: "good" | "watch" | "risk" | "info"; title: string; text: string };

export type RetainedData = {
  start_date?: string;
  end_date?: string;
  accounting_method?: string;
  netProfit?: number;
  longTermAssetsMovement?: number;
  longTermAssets?: { end: number; prior: number; detail?: Array<{ label: string; end: number; prior: number; movement: number }> };
  investments?: {
    items?: Array<{ label: string; amount: number; type: "investment" | "contribution" }>;
    contribution: number;
    totalInvestments: number;
    netInvestments: number;
  };
  retainedEarning?: number;
  cashFlow?: CashFlow | null;
  monthly?: Array<{ month: string; label: string; netProfit: number; assets: number; netInvestments: number; retained: number; cumulativeRetained: number }>;
  monthlyCoverage?: { months: number; totalMonths: number; from: string | null; to: string | null; truncated: boolean };
  previous?: { start: string; end: string; netProfit: number; longTermAssetsMovement: number; netInvestments: number; retainedEarning: number } | null;
  ratios?: { retentionRatio: number | null; reinvestmentRatio: number | null; assetsShare: number | null; investmentsShare: number | null; positiveMonths: number; months: number };
  verdict?: { status: "healthy" | "balanced" | "watch" | "risk"; label: string; headline: string };
  insights?: Insight[];
};

type CashLine = { key: string; label: string; activity: "operating" | "investing"; total: number; average: number; note: string };

type CashFlow = {
  months: number;
  basis: "Cash";
  inflows: CashLine[];
  outflows: CashLine[];
  totalInflow: number;
  totalOutflow: number;
  avgInflow: number;
  avgOutflow: number;
  netCashFlow: number;
  avgNetCashFlow: number;
  coverage: number | null;
  nonCashExcluded: number;
};

/* ---------------- colours & format ---------------- */

const C = {
  profit: "#60a5fa",
  deduct: "#fb7185",
  add: "#34d399",
  retained: "#34d399",
  retainedNeg: "#fb7185",
  cumulative: "#fbbf24",
  // Cash in / out pair (validated for colour-blind separation on the dark surface)
  cashIn: "#3987e5",
  cashOut: "#d95926",
};

function formatShort(n: number, currency: string) {
  const pre = moneyPrefix(currency, n < 0);
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${pre}${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${pre}${Math.round(a / 1_000).toLocaleString("en")}K`;
  return `${pre}${Math.round(a).toLocaleString("en")}`;
}

function formatFull(n: number, currency: string) {
  return `${moneyPrefix(currency, n < 0)}${Math.round(Math.abs(n)).toLocaleString("en")}`;
}

/** Formatters in the display currency of the panel (see MoneyProvider). */
function useFmt() {
  const { currency } = useMoneyCurrency();
  return {
    fmt: (n: number) => formatShort(n, currency),
    fmtFull: (n: number) => formatFull(n, currency),
    fmtAxis: (n: number) => formatShort(n, currency).replace(moneyPrefix(currency), ""),
  };
}

/**
 * The same data with all amounts multiplied by `f` (currency conversion).
 * Ratios do not change. The verdict and insights have amounts in their text,
 * so they are written again in the display currency.
 */
function convertRetained(d: RetainedData, f: number, currency: string): RetainedData {
  const x = (n: number | undefined) => (n == null ? n : n * f) as number;
  const cashLine = (l: CashLine): CashLine => ({ ...l, total: l.total * f, average: l.average * f });
  const out: RetainedData = {
    ...d,
    netProfit: x(d.netProfit),
    longTermAssetsMovement: x(d.longTermAssetsMovement),
    longTermAssets: d.longTermAssets && {
      end: d.longTermAssets.end * f,
      prior: d.longTermAssets.prior * f,
      detail: d.longTermAssets.detail?.map((r) => ({ ...r, end: r.end * f, prior: r.prior * f, movement: r.movement * f })),
    },
    investments: d.investments && {
      items: d.investments.items?.map((it) => ({ ...it, amount: it.amount * f })),
      contribution: d.investments.contribution * f,
      totalInvestments: d.investments.totalInvestments * f,
      netInvestments: d.investments.netInvestments * f,
    },
    retainedEarning: x(d.retainedEarning),
    cashFlow: d.cashFlow && {
      ...d.cashFlow,
      inflows: d.cashFlow.inflows.map(cashLine),
      outflows: d.cashFlow.outflows.map(cashLine),
      totalInflow: d.cashFlow.totalInflow * f,
      totalOutflow: d.cashFlow.totalOutflow * f,
      avgInflow: d.cashFlow.avgInflow * f,
      avgOutflow: d.cashFlow.avgOutflow * f,
      netCashFlow: d.cashFlow.netCashFlow * f,
      avgNetCashFlow: d.cashFlow.avgNetCashFlow * f,
      nonCashExcluded: d.cashFlow.nonCashExcluded * f,
    },
    monthly: d.monthly?.map((m) => ({
      ...m,
      netProfit: m.netProfit * f,
      assets: m.assets * f,
      netInvestments: m.netInvestments * f,
      retained: m.retained * f,
      cumulativeRetained: m.cumulativeRetained * f,
    })),
    previous: d.previous && {
      ...d.previous,
      netProfit: d.previous.netProfit * f,
      longTermAssetsMovement: d.previous.longTermAssetsMovement * f,
      netInvestments: d.previous.netInvestments * f,
      retainedEarning: d.previous.retainedEarning * f,
    },
  };
  if (d.ratios && d.verdict) {
    const money = (n: number) => formatShort(n, currency);
    const c: Components = {
      netProfit: out.netProfit ?? 0,
      ltDetail: out.longTermAssets?.detail ?? [],
      ltEnd: out.longTermAssets?.end ?? 0,
      ltPrior: out.longTermAssets?.prior ?? 0,
      longTermAssetsMovement: out.longTermAssetsMovement ?? 0,
      items: out.investments?.items ?? [],
      totalInvestments: out.investments?.totalInvestments ?? 0,
      contribution: out.investments?.contribution ?? 0,
      netInvestments: out.investments?.netInvestments ?? 0,
      retainedEarning: out.retainedEarning ?? 0,
    };
    out.verdict = buildVerdict(c, d.ratios, money);
    out.insights = buildInsights(c, d.ratios, out.monthly ?? [], out.previous ?? null, d.monthlyCoverage?.truncated ?? false, money);
  }
  return out;
}

const STATUS = {
  healthy: { ring: "ring-emerald-400/30", bg: "from-emerald-500/15", text: "text-emerald-300", chip: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30" },
  balanced: { ring: "ring-sky-400/30", bg: "from-sky-500/15", text: "text-sky-300", chip: "bg-sky-400/15 text-sky-200 border-sky-300/30" },
  watch: { ring: "ring-amber-400/30", bg: "from-amber-500/15", text: "text-amber-300", chip: "bg-amber-400/15 text-amber-200 border-amber-300/30" },
  risk: { ring: "ring-rose-400/30", bg: "from-rose-500/15", text: "text-rose-300", chip: "bg-rose-400/15 text-rose-200 border-rose-300/30" },
} as const;

/* ---------------- main ---------------- */

export default function RetainedEarningPanel({
  data,
  loading,
  currency = "PKR",
  factor = 1,
  alt,
}: {
  data: RetainedData | null;
  loading: boolean;
  /** Display currency, and the factor from the QuickBooks home currency to it. */
  currency?: string;
  factor?: number;
  /** The same amount in the other currency ("≈ $4K"). */
  alt?: (n: number) => string;
}) {
  if (loading && !data) return <Skeleton />;
  if (!data) {
    return <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">No retained earning data for this period.</div>;
  }
  return (
    <MoneyProvider currency={currency}>
      <RetainedBody data={factor !== 1 ? convertRetained(data, factor, currency) : data} alt={alt} />
    </MoneyProvider>
  );
}

function RetainedBody({ data, alt }: { data: RetainedData; alt?: (n: number) => string }) {
  const { fmt, fmtFull } = useFmt();

  const profit = data.netProfit ?? 0;
  const assets = data.longTermAssetsMovement ?? 0;
  const inv = data.investments ?? { contribution: 0, totalInvestments: 0, netInvestments: 0, items: [] };
  const retained = data.retainedEarning ?? 0;
  const prev = data.previous ?? null;
  const ratios = data.ratios;
  const verdict = data.verdict ?? { status: retained >= 0 ? "balanced" : "risk", label: retained >= 0 ? "Balanced" : "Spending more than earned", headline: "" };
  const st = STATUS[verdict.status];
  const monthly = data.monthly ?? [];

  return (
    <div className="re-in mt-6 space-y-5">
      {/* Hero: verdict + retention gauge */}
      <div className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br ${st.bg} via-[#0b1222]/90 to-[#050914]/90 p-6 ring-1 ${st.ring} shadow-[0_24px_80px_rgba(0,0,0,0.45)]`}>
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Retained earning</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${st.chip}`}>
                <StatusIcon status={verdict.status} />
                {verdict.label}
              </span>
            </div>
            <div className={`mt-3 text-4xl font-semibold tracking-tight tabular-nums md:text-5xl ${retained >= 0 ? "text-white" : "text-rose-200"}`} title={fmtFull(retained)}>
              {fmt(retained)}
            </div>
            {alt ? <div className="mt-1 text-sm font-medium tabular-nums text-slate-300">{alt(retained)}</div> : null}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">{verdict.headline}</p>
            <div className="mt-3 text-[11px] text-slate-500">
              {data.start_date} → {data.end_date} · {data.accounting_method ?? "Accrual"} basis
              {prev ? ` · compared with ${prev.start} → ${prev.end}` : ""}
            </div>
          </div>
          <RetentionGauge ratio={ratios?.retentionRatio ?? null} />
        </div>
      </div>

      {/* KPI tiles with change vs previous period */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Net profit" value={profit} alt={alt} prev={prev?.netProfit} goodWhenUp accent={C.profit} note="Earned in the period (P&L)" />
        <Kpi label="Asset purchases" value={assets} alt={alt} prev={prev?.longTermAssetsMovement} accent={C.deduct} note="Fixed assets, without depreciation" />
        <Kpi
          label="Net investments"
          value={inv.netInvestments}
          prev={prev?.netInvestments}
          alt={alt}
          accent={C.deduct}
          note={`Invested ${fmt(inv.totalInvestments)} · Received ${fmt(inv.contribution)}`}
        />
        <Kpi label="Retained earning" value={retained} alt={alt} prev={prev?.retainedEarning} goodWhenUp accent={retained >= 0 ? C.retained : C.retainedNeg} note="What the company kept" emphasis />
      </div>

      {/* Bridge + allocation */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card title="From profit to retained earning" className="xl:col-span-3" hint="How the profit becomes the retained amount, step by step">
          <Bridge profit={profit} assets={assets} invested={inv.totalInvestments} contributions={inv.contribution} retained={retained} />
        </Card>
        <Card title={`Where every ${fmt(100)} of profit went`} className="xl:col-span-2">
          <Allocation profit={profit} assets={assets} netInvestments={inv.netInvestments} retained={retained} />
        </Card>
      </div>

      {/* Cash inflow vs outflow */}
      {data.cashFlow ? (
        <Card
          title="Average monthly cash inflow and outflow"
          hint={`${data.cashFlow.months} month${data.cashFlow.months === 1 ? "" : "s"} · cash basis`}
        >
          <CashFlowView cf={data.cashFlow} />
        </Card>
      ) : null}

      {/* Monthly trend */}
      {monthly.length > 0 ? (
        <Card
          title="Month by month"
          hint={
            ratios && ratios.months > 0
              ? `${ratios.positiveMonths} of ${ratios.months}${data.monthlyCoverage?.truncated ? " shown" : ""} months added to retained earning`
              : undefined
          }
        >
          {data.monthlyCoverage?.truncated ? (
            <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Only the last {data.monthlyCoverage.months} of {data.monthlyCoverage.totalMonths} months are shown here ({monthly[0].label} –{" "}
              {monthly[monthly.length - 1].label}). The running total starts in {monthly[0].label}. The totals above still cover the whole period.
            </div>
          ) : null}
          <MonthlyTrend monthly={monthly} />
        </Card>
      ) : null}

      {/* Insights */}
      {data.insights?.length ? (
        <Card title="What this means">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.insights.map((it, i) => (
              <InsightCard key={i} insight={it} delay={i * 60} />
            ))}
          </div>
        </Card>
      ) : null}

      {/* Detail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Long-term assets">
          <AssetsDetail detail={data.longTermAssets?.detail ?? []} total={assets} />
        </Card>
        <Card title="Investments and contributions">
          <InvestmentsDetail items={inv.items ?? []} net={inv.netInvestments} />
        </Card>
      </div>

      <style jsx global>{`
        @keyframes re-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .re-in {
          animation: re-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes re-gauge {
          from {
            stroke-dashoffset: var(--re-circ);
          }
        }
        .re-gauge {
          animation: re-gauge 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes re-grow {
          from {
            transform: scaleX(0);
          }
        }
        .re-grow {
          transform-origin: left center;
          animation: re-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes re-shimmer {
          from {
            background-position: -200% 0;
          }
          to {
            background-position: 200% 0;
          }
        }
        .re-shimmer {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
          background-size: 200% 100%;
          animation: re-shimmer 1.6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .re-in,
          .re-gauge,
          .re-grow,
          .re-shimmer {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------------- hero gauge ---------------- */

function RetentionGauge({ ratio }: { ratio: number | null }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = ratio == null ? 0 : Math.max(0, Math.min(1, ratio));
  const color = ratio == null ? "#64748b" : ratio < 0 ? C.retainedNeg : ratio >= 0.6 ? C.retained : ratio >= 0.3 ? C.profit : "#fbbf24";
  return (
    <div className="flex flex-col items-center justify-self-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            className="re-gauge"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - clamped)}
            style={{ ["--re-circ" as string]: `${circ}`, filter: `drop-shadow(0 0 10px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-3xl font-semibold tabular-nums text-white">{ratio == null ? "—" : `${Math.round(ratio * 100)}%`}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">of profit kept</div>
          </div>
        </div>
      </div>
      <div className="mt-2 text-center text-[11px] text-slate-500">{ratio == null ? "No profit in this period" : "Retention ratio"}</div>
    </div>
  );
}

/* ---------------- KPI ---------------- */

function Kpi({
  label,
  value,
  prev,
  note,
  accent,
  goodWhenUp,
  emphasis,
  alt,
}: {
  label: string;
  value: number;
  alt?: (n: number) => string;
  prev?: number;
  note: string;
  accent: string;
  goodWhenUp?: boolean;
  emphasis?: boolean;
}) {
  const { fmt, fmtFull } = useFmt();
  const hasPrev = prev !== undefined && prev !== null;
  const diff = hasPrev ? value - (prev as number) : 0;
  const pctChange = hasPrev && prev !== 0 ? diff / Math.abs(prev as number) : null;
  const up = diff > 0;
  // Profit / retained: up is good. Spending: shown neutral (slate) — a rise is a choice, not a fault.
  const tone = !hasPrev || diff === 0 ? "text-slate-400" : goodWhenUp ? (up ? "text-emerald-300" : "text-rose-300") : "text-slate-300";
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${emphasis ? "border-white/20 bg-white/[0.07]" : "border-white/10 bg-white/[0.04]"}`}>
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white" title={fmtFull(value)}>
        {fmt(value)}
      </div>
      {alt ? <div className="text-xs font-medium tabular-nums text-slate-300">{alt(value)}</div> : null}
      <div className="mt-1 truncate text-[11px] text-slate-500">{note}</div>
      {hasPrev ? (
        <div className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${tone}`}>
          {diff !== 0 ? <Arrow up={up} /> : <span>•</span>}
          {diff === 0 ? "Same as previous period" : `${fmt(Math.abs(diff))}${pctChange != null ? ` (${up ? "+" : "−"}${Math.round(Math.abs(pctChange) * 100)}%)` : ""} vs previous`}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- bridge (waterfall) ---------------- */

type Step = { name: string; title: string; range: [number, number]; value: number; color: string; kind: "total" | "minus" | "plus" };

function Bridge({ profit, assets, invested, contributions, retained }: { profit: number; assets: number; invested: number; contributions: number; retained: number }) {
  const { fmt, fmtAxis } = useFmt();
  const steps: Step[] = [];
  let run = 0;
  const push = (name: string, title: string, delta: number, kind: Step["kind"], color: string) => {
    const from = kind === "total" ? 0 : run;
    const to = kind === "total" ? delta : run + delta;
    steps.push({ name, title, range: [Math.min(from, to), Math.max(from, to)], value: delta, color, kind });
    run = to;
  };
  push("Profit", "Net profit", profit, "total", C.profit);
  push("Assets", "Asset purchases", -assets, assets >= 0 ? "minus" : "plus", assets >= 0 ? C.deduct : C.add);
  push("Invested", "Investments", -invested, "minus", C.deduct);
  push("Received", "Contributions received", contributions, "plus", C.add);
  steps.push({ name: "Retained", title: "Retained earning", range: [Math.min(0, retained), Math.max(0, retained)], value: retained, color: retained >= 0 ? C.retained : C.retainedNeg, kind: "total" });

  return (
    <div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={steps} margin={{ top: 28, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tickFormatter={(v: number) => fmtAxis(v)} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<BridgeTip />} />
            <Bar dataKey="range" radius={[4, 4, 4, 4]} animationDuration={900}>
              {steps.map((s) => (
                <Cell key={s.name} fill={s.color} fillOpacity={s.kind === "total" ? 0.95 : 0.75} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                content={(props) => {
                  const x = Number(props.x ?? 0);
                  const y = Number(props.y ?? 0);
                  const width = Number(props.width ?? 0);
                  const value = Number(props.value ?? 0);
                  const index = Number(props.index ?? 0);
                  if (width < 44) return null; // too narrow (phone): the list below shows the values
                  const s = steps[index];
                  const text = s.kind === "total" ? fmt(value) : `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value))}`;
                  return (
                    <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="rgba(241,245,249,0.9)" fontSize={11} fontWeight={600}>
                      {text}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1.5 sm:hidden">
        {steps.map((s) => (
          <li key={s.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.title}
            </span>
            <span className="font-semibold tabular-nums text-white">
              {s.kind === "total" ? fmt(s.value) : `${s.value >= 0 ? "+" : "−"}${fmt(Math.abs(s.value))}`}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <LegendDot color={C.profit} label="Profit" />
        <LegendDot color={C.deduct} label="Takes away from profit" />
        <LegendDot color={C.add} label="Adds back" />
      </div>
    </div>
  );
}

function BridgeTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Step }> }) {
  const { fmtFull } = useFmt();
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  const explain: Record<string, string> = {
    Profit: "Profit from the P&L for the period.",
    Assets: "Increase in fixed assets (all fixed-asset accounts, without depreciation).",
    Invested: "Money put into investments.",
    Received: "Contributions received back.",
    Retained: "What the company kept after all of the above.",
  };
  return (
    <div className="max-w-[240px] rounded-xl border border-white/10 bg-[#0b1424]/95 px-3 py-2.5 text-xs shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="font-semibold text-white">{s.title}</div>
      <div className="mt-1 tabular-nums text-slate-200">{fmtFull(s.value)}</div>
      <div className="mt-1 text-slate-400">{explain[s.name]}</div>
    </div>
  );
}

/* ---------------- allocation ---------------- */

function Allocation({ profit, assets, netInvestments, retained }: { profit: number; assets: number; netInvestments: number; retained: number }) {
  const { fmt, fmtFull } = useFmt();
  if (profit <= 0) {
    return <div className="py-6 text-sm text-slate-400">There was no profit in this period, so there is nothing to split.</div>;
  }
  const parts = [
    { label: "Kept (retained)", value: Math.max(retained, 0), color: C.retained },
    { label: "Asset purchases", value: Math.max(assets, 0), color: "#f97316" },
    { label: "Net investments", value: Math.max(netInvestments, 0), color: "#a78bfa" },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const overspent = retained < 0;
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-white/5">
        {parts.map((p, i) =>
          p.value > 0 ? (
            <div
              key={p.label}
              className="re-grow h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color, marginLeft: i > 0 ? 2 : 0, animationDelay: `${i * 120}ms` }}
              title={`${p.label}: ${fmtFull(p.value)}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-5 space-y-3">
        {parts.map((p) => {
          const share = p.value / profit;
          return (
            <div key={p.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                {p.label}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-white">{fmt(Math.round(share * 100))}</div>
                <div className="text-[11px] tabular-nums text-slate-500">{fmt(p.value)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {overspent ? (
        <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-xs text-rose-200">
          Assets and investments were {fmt(-retained)} more than the profit. That part was paid from existing reserves.
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-slate-500">Read as: for every {fmt(100)} of profit, this is where the money went.</p>
      )}
    </div>
  );
}

/* ---------------- monthly ---------------- */

function MonthlyTrend({ monthly }: { monthly: NonNullable<RetainedData["monthly"]> }) {
  const { fmtAxis } = useFmt();
  return (
    <div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={monthly} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => fmtAxis(v)} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<MonthTip />} />
            <Bar dataKey="netProfit" name="Net profit" fill={C.profit} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="retained" name="Retained" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {monthly.map((m) => (
                <Cell key={m.month} fill={m.retained >= 0 ? C.retained : C.retainedNeg} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="cumulativeRetained" name="Running total" stroke={C.cumulative} strokeWidth={2} dot={{ r: 3, fill: C.cumulative, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <LegendDot color={C.profit} label="Net profit" faded />
        <LegendDot color={C.retained} label="Retained (month)" />
        <LegendDot color={C.retainedNeg} label="Month that used reserves" />
        <LegendDot color={C.cumulative} label="Running total kept" line />
      </div>
    </div>
  );
}

function MonthTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: NonNullable<RetainedData["monthly"]>[number] }> }) {
  const { fmtFull } = useFmt();
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  const row = (l: string, v: number, c?: string) => (
    <div className="flex justify-between gap-4">
      <span className="text-slate-400">{l}</span>
      <span className="tabular-nums" style={{ color: c ?? "#e2e8f0" }}>
        {fmtFull(v)}
      </span>
    </div>
  );
  return (
    <div className="min-w-[220px] rounded-xl border border-white/10 bg-[#0b1424]/95 px-3 py-2.5 text-xs shadow-[0_16px_36px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="mb-1.5 font-semibold text-white">{m.label}</div>
      {row("Net profit", m.netProfit)}
      {row("− Asset purchases", m.assets)}
      {row("− Net investments", m.netInvestments)}
      <div className="my-1 border-t border-white/10" />
      {row("Retained", m.retained, m.retained >= 0 ? C.retained : C.retainedNeg)}
      {row("Running total", m.cumulativeRetained, C.cumulative)}
    </div>
  );
}

/* ---------------- cash inflow / outflow ---------------- */

// Simple line icons (24px viewBox) for each cash line.
const CASH_ICON: Record<string, string> = {
  income: "M3 17l6-6 4 4 8-8M15 7h6v6",
  otherIncome: "M12 5v14M5 12h14",
  disposals: "M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01",
  contributions: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  cogs: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8",
  expenses: "M6 2h12v20l-3-2-3 2-3-2-3 2V2zM9 7h6M9 11h6M9 15h4",
  otherExpenses: "M5 12h.01M12 12h.01M19 12h.01",
  assets: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  investments: "M3 3v18h18M7 15l4-4 3 3 5-6",
};

function CashFlowView({ cf }: { cf: CashFlow }) {
  const { fmt, fmtFull } = useFmt();
  const net = cf.avgNetCashFlow;
  const surplus = net >= 0;
  const [showTable, setShowTable] = React.useState(false);

  return (
    <div className="space-y-6">
      {/* Headline: cash in, cash out, net + coverage ring */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1.25fr]">
        <BigStat icon="in" label="Cash in" sub="average per month" value={cf.avgInflow} color={C.cashIn} />
        <BigStat icon="out" label="Cash out" sub="average per month" value={cf.avgOutflow} color={C.cashOut} />
        <div
          className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 ${
            surplus ? "border-emerald-400/25 bg-emerald-500/[0.08]" : "border-rose-400/25 bg-rose-500/[0.08]"
          }`}
        >
          <CoverageRing ratio={cf.coverage} good={surplus} />
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                surplus ? STATUS.healthy.chip : STATUS.risk.chip
              }`}
            >
              <StatusIcon status={surplus ? "healthy" : "risk"} />
              {surplus ? "Cash surplus" : "Cash shortfall"}
            </span>
            <div className={`mt-1.5 text-2xl font-semibold tabular-nums md:text-3xl ${surplus ? "text-emerald-200" : "text-rose-200"}`} title={fmtFull(net)}>
              {surplus ? "+" : "−"}
              {fmt(Math.abs(net))}
            </div>
            <div className="text-[11px] text-slate-400">net per month</div>
          </div>
        </div>
      </div>

      {/* Cash in vs cash out on one scale */}
      <CompareBars avgIn={cf.avgInflow} avgOut={cf.avgOutflow} />

      {/* Where cash comes from / goes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SourceList title="Where cash comes from" lines={cf.inflows} total={cf.avgInflow} color={C.cashIn} />
        <SourceList title="Where cash goes" lines={cf.outflows} total={cf.avgOutflow} color={C.cashOut} />
      </div>

      {/* Full table for accountants */}
      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${showTable ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
          {showTable ? "Hide full table" : "Show full table and method"}
        </button>
        {showTable ? <CashTable cf={cf} /> : null}
      </div>
    </div>
  );
}

function BigStat({ icon, label, sub, value, color }: { icon: "in" | "out"; label: string; sub: string; value: number; color: string }) {
  const { fmt, fmtFull } = useFmt();
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}26`, color }}>
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon === "in" ? "M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" : "M12 20V8m0 0l-5 5m5-5l5 5M5 4h14"} />
        </svg>
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-white md:text-3xl" title={fmtFull(value)}>
          {fmt(value)}
        </div>
        <div className="text-[11px] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function CoverageRing({ ratio, good }: { ratio: number | null; good: boolean }) {
  const size = 76;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = ratio == null ? 0 : Math.max(0, Math.min(1, ratio));
  const color = good ? C.retained : C.retainedNeg;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title="Cash in as a share of cash out">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          className="re-gauge"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
          style={{ ["--re-circ" as string]: `${circ}`, filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-sm font-semibold tabular-nums text-white">{ratio == null ? "—" : `${Math.round(ratio * 100)}%`}</div>
          <div className="text-[8px] uppercase tracking-[0.1em] text-slate-400">covered</div>
        </div>
      </div>
    </div>
  );
}

/** Cash in and cash out on one scale; the gap shows as a hatched shortfall or surplus. */
function CompareBars({ avgIn, avgOut }: { avgIn: number; avgOut: number }) {
  const { fmt, fmtFull } = useFmt();
  const max = Math.max(avgIn, avgOut, 1);
  const gap = Math.abs(avgIn - avgOut);
  const surplus = avgIn >= avgOut;
  const rows = [
    { label: "Cash in", value: avgIn, color: C.cashIn, short: !surplus },
    { label: "Cash out", value: avgOut, color: C.cashOut, short: surplus },
  ];
  const gapColor = surplus ? C.retained : C.retainedNeg;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cash in vs cash out · per month</div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.label} className="grid grid-cols-[64px_1fr] items-center gap-3 sm:grid-cols-[80px_1fr]">
            <span className="text-xs font-medium text-slate-300">{r.label}</span>
            <div className="flex h-9 w-full items-center">
              <div
                className="re-grow flex h-full items-center justify-end rounded-l-lg px-2 text-xs font-semibold tabular-nums text-white"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: `linear-gradient(90deg, ${r.color}99, ${r.color})`,
                  borderRadius: r.short && gap > 0 ? "8px 0 0 8px" : 8,
                  animationDelay: `${i * 120}ms`,
                }}
                title={fmtFull(r.value)}
              >
                {r.value / max > 0.18 ? fmt(r.value) : null}
              </div>
              {r.short && gap > 0 ? (
                <div
                  className="re-grow h-full rounded-r-lg border border-dashed"
                  style={{
                    width: `${(gap / max) * 100}%`,
                    borderColor: gapColor,
                    background: `repeating-linear-gradient(135deg, ${gapColor}40 0 6px, transparent 6px 12px)`,
                    animationDelay: "360ms",
                  }}
                  title={`${surplus ? "Surplus" : "Shortfall"}: ${fmtFull(gap)}`}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
        {gap === 0 ? (
          "Cash in and cash out were equal."
        ) : surplus ? (
          <>
            The <span className="font-semibold text-emerald-200">hatched part</span> is cash kept: {fmt(gap)} per month more came in than went out.
          </>
        ) : (
          <>
            The <span className="font-semibold text-rose-200">hatched part</span> is the shortfall: {fmt(gap)} per month more went out than came in. It was paid from
            existing cash.
          </>
        )}
      </p>
    </div>
  );
}

function SourceList({ title, lines, total, color }: { title: string; lines: CashLine[]; total: number; color: string }) {
  const { fmt, fmtFull } = useFmt();
  const sorted = [...lines].sort((a, b) => b.average - a.average);
  const max = Math.max(1, ...sorted.map((l) => Math.abs(l.average)));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">{title}</span>
      </div>
      {sorted.length ? (
        <div className="space-y-3.5">
          {sorted.map((l, i) => {
            const share = total > 0 ? l.average / total : 0;
            return (
              <div key={l.key} title={`${l.label}: ${fmtFull(l.average)} per month · ${fmtFull(l.total)} in the period`}>
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${color}1f`, color }}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d={CASH_ICON[l.key] ?? CASH_ICON.otherIncome} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-sm leading-snug text-slate-200">{l.label}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{fmt(l.average)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="re-grow h-full rounded-full"
                          style={{ width: `${(Math.abs(l.average) / max) * 100}%`, background: color, animationDelay: `${i * 80}ms` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{Math.round(share * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-3 text-sm text-slate-400">None in this period.</div>
      )}
    </div>
  );
}

function CashTable({ cf }: { cf: CashFlow }) {
  const { fmt, fmtFull } = useFmt();
  const net = cf.avgNetCashFlow;
  return (
    <div className="re-in mt-4">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <th className="pb-2 text-left font-medium">Cash flow</th>
            <th className="w-[24%] pb-2 text-right font-medium">Avg / month</th>
            <th className="w-[24%] pb-2 text-right font-medium">Period total</th>
          </tr>
        </thead>
        <tbody>
          <CashSection title="Cash inflows" lines={cf.inflows} color={C.cashIn} />
          <CashTotal label="Total cash inflow" average={cf.avgInflow} total={cf.totalInflow} />
          <CashSection title="Cash outflows" lines={cf.outflows} color={C.cashOut} />
          <CashTotal label="Total cash outflow" average={cf.avgOutflow} total={cf.totalOutflow} />
          <tr className="border-t-2 border-white/20">
            <td className="pt-3 font-semibold text-white">Net cash flow</td>
            <td className={`pt-3 text-right font-semibold tabular-nums ${net >= 0 ? "text-emerald-200" : "text-rose-200"}`} title={fmtFull(net)}>
              {fmt(net)}
            </td>
            <td className={`pt-3 text-right font-semibold tabular-nums ${cf.netCashFlow >= 0 ? "text-emerald-200" : "text-rose-200"}`} title={fmtFull(cf.netCashFlow)}>
              {fmt(cf.netCashFlow)}
            </td>
          </tr>
        </tbody>
      </table>
      <ul className="mt-4 space-y-1 text-[11px] leading-relaxed text-slate-500">
        <li>Income and expenses come from the P&L on cash basis (money received and paid), whatever basis is selected above.</li>
        {cf.nonCashExcluded !== 0 ? <li>Depreciation and amortization ({fmt(cf.nonCashExcluded)}) are not included: they are non-cash charges.</li> : null}
        <li>Fixed assets and investments use balance movements: purchases bought on credit show here before they are paid.</li>
        <li>
          Average = period total ÷ {cf.months} calendar month{cf.months === 1 ? "" : "s"}.
        </li>
      </ul>
    </div>
  );
}

function CashSection({ title, lines, color }: { title: string; lines: CashLine[]; color: string }) {
  const { fmt, fmtFull } = useFmt();
  return (
    <>
      <tr>
        <td colSpan={3} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color }} />
          {title}
        </td>
      </tr>
      {lines.length ? (
        lines.map((l) => (
          <tr key={l.key} className="border-b border-white/5">
            <td className="py-1.5 pr-2">
              <div className="text-slate-200">{l.label}</div>
              <div className="text-[10px] text-slate-500">
                {l.activity === "operating" ? "Operating" : "Investing"} · {l.note}
              </div>
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-200" title={fmtFull(l.average)}>
              {fmt(l.average)}
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-400" title={fmtFull(l.total)}>
              {fmt(l.total)}
            </td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={3} className="py-1.5 text-slate-500">
            None in this period
          </td>
        </tr>
      )}
    </>
  );
}

function CashTotal({ label, average, total }: { label: string; average: number; total: number }) {
  const { fmt, fmtFull } = useFmt();
  return (
    <tr>
      <td className="py-2 font-semibold text-slate-200">{label}</td>
      <td className="py-2 text-right font-semibold tabular-nums text-white" title={fmtFull(average)}>
        {fmt(average)}
      </td>
      <td className="py-2 text-right font-semibold tabular-nums text-slate-300" title={fmtFull(total)}>
        {fmt(total)}
      </td>
    </tr>
  );
}

/* ---------------- insights ---------------- */

const TONE = {
  good: { box: "border-emerald-400/20 bg-emerald-500/[0.06]", icon: "bg-emerald-400/15 text-emerald-300", label: "Good sign" },
  watch: { box: "border-amber-400/20 bg-amber-500/[0.06]", icon: "bg-amber-400/15 text-amber-300", label: "Watch" },
  risk: { box: "border-rose-400/20 bg-rose-500/[0.06]", icon: "bg-rose-400/15 text-rose-300", label: "Risk" },
  info: { box: "border-white/10 bg-white/[0.03]", icon: "bg-sky-400/15 text-sky-300", label: "Info" },
} as const;

function InsightCard({ insight, delay }: { insight: Insight; delay: number }) {
  const t = TONE[insight.tone];
  return (
    <div className={`re-in flex gap-3 rounded-2xl border p-4 ${t.box}`} style={{ animationDelay: `${delay}ms` }}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.icon}`} aria-label={t.label}>
        <ToneIcon tone={insight.tone} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{insight.title}</span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{t.label}</span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{insight.text}</p>
      </div>
    </div>
  );
}

/* ---------------- detail tables ---------------- */

function AssetsDetail({ detail, total }: { detail: Array<{ label: string; end: number; prior: number; movement: number }>; total: number }) {
  const { fmt } = useFmt();
  if (!detail.length) return <div className="py-3 text-sm text-slate-400">No long-term asset movement.</div>;
  const max = Math.max(1, ...detail.map((d) => Math.abs(d.movement)));
  return (
    <div className="space-y-3">
      {detail.map((d) => (
        <div key={d.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-200">{d.label}</span>
            <span className={`font-semibold tabular-nums ${d.movement > 0 ? "text-rose-200" : d.movement < 0 ? "text-emerald-200" : "text-slate-400"}`}>
              {d.movement > 0 ? "+" : ""}
              {fmt(d.movement)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <div className="re-grow h-full rounded-full" style={{ width: `${(Math.abs(d.movement) / max) * 100}%`, background: d.movement >= 0 ? "#f97316" : C.add }} />
            </div>
            <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
              {fmt(d.prior)} → {fmt(d.end)}
            </span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm font-semibold">
        <span className="text-slate-300">Total movement</span>
        <span className="tabular-nums text-white">{fmt(total)}</span>
      </div>
    </div>
  );
}

function InvestmentsDetail({ items, net }: { items: Array<{ label: string; amount: number; type: "investment" | "contribution" }>; net: number }) {
  const { fmt } = useFmt();
  const shown = items.filter((x) => x.amount !== 0);
  if (!shown.length) return <div className="py-3 text-sm text-slate-400">No investment or contribution movement.</div>;
  return (
    <div className="space-y-2">
      {shown.map((x) => (
        <div key={x.label} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200" title={x.label}>
              {x.label}
            </div>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                x.type === "investment" ? "bg-violet-400/15 text-violet-200" : "bg-emerald-400/15 text-emerald-200"
              }`}
            >
              {x.type === "investment" ? "Invested (reduces retained)" : "Received (adds back)"}
            </span>
          </div>
          <span className={`shrink-0 font-semibold tabular-nums ${x.type === "investment" ? "text-rose-200" : "text-emerald-200"}`}>
            {x.type === "investment" ? "−" : "+"}
            {fmt(x.amount)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm font-semibold">
        <span className="text-slate-300">Net investments</span>
        <span className="tabular-nums text-white">{fmt(net)}</span>
      </div>
    </div>
  );
}

/* ---------------- small parts ---------------- */

function Card({ title, hint, className = "", children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(3,7,18,0.76))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-100">{title}</div>
        {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function LegendDot({ color, label, faded, line }: { color: string; label: string; faded?: boolean; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {line ? (
        <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} />
      ) : (
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color, opacity: faded ? 0.45 : 1 }} />
      )}
      {label}
    </span>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} aria-hidden>
      {up ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />}
    </svg>
  );
}

function StatusIcon({ status }: { status: "healthy" | "balanced" | "watch" | "risk" }) {
  const d =
    status === "healthy"
      ? "M5 13l4 4L19 7"
      : status === "balanced"
      ? "M4 12h16M12 4v16"
      : status === "watch"
      ? "M12 8v5m0 3h.01"
      : "M6 6l12 12M18 6L6 18";
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function ToneIcon({ tone }: { tone: Insight["tone"] }) {
  const d =
    tone === "good"
      ? "M5 13l4 4L19 7"
      : tone === "watch"
      ? "M12 8v5m0 3h.01"
      : tone === "risk"
      ? "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
      : "M12 16v-4m0-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z";
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="mt-6 space-y-5" aria-busy="true">
      <div className="re-shimmer h-[220px] rounded-[28px]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="re-shimmer h-[118px] rounded-2xl" />
        ))}
      </div>
      <div className="re-shimmer h-[360px] rounded-[24px]" />
    </div>
  );
}
