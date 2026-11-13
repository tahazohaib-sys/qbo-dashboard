"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LabelList,
} from "recharts";
import { C, Card, ChartTip, Kpi, LegendRow, StatusBadge, fmtPct, fmtPkr, fmtShort, fmtUsd, type TipProps } from "./ui";

/* ------------------------------------------------------------------ */
/* Types (same shape as the API)                                       */
/* ------------------------------------------------------------------ */

export type ReportEmployee = {
  employeeName: string;
  designation: string;
  grossSalary: number;
  percentage: number;
  cost: number;
  notInSalarySheet: boolean;
};
export type ReportProject = {
  project: string;
  revenueUsd: number;
  revenuePkr: number | null;
  employees: ReportEmployee[];
  directCost: number;
  contribution: number | null;
  marginPct: number | null;
};
export type Unallocated = {
  employeeName: string;
  designation: string;
  grossSalary: number;
  allocatedPct: number;
  unallocatedPct: number;
  unallocatedSalary: number;
  status: "unallocated" | "partial";
};
export type Totals = {
  revenueUsd: number;
  revenuePkr: number | null;
  directCost: number;
  contribution: number | null;
  marginPct: number | null;
  techPayroll: number;
  unallocatedPayroll: number;
  utilizationPct: number | null;
  techHeadcount: number;
  fullyAllocated: number;
  partiallyAllocated: number;
  notAllocated: number;
  projectCount: number;
};
export type MonthReport = { projects: ReportProject[]; unallocated: Unallocated[]; totals: Totals };
export type HistoryMonth = Totals & {
  month: string;
  label: string;
  hasSalaryData: boolean;
  projects: Array<{ project: string; revenuePkr: number | null; directCost: number; contribution: number | null; marginPct: number | null }>;
};

const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const;

function pctChange(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur === null || cur === undefined || prev === null || prev === undefined || !prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export function Overview({
  report,
  monthLabel,
  department,
  previous,
}: {
  report: MonthReport;
  monthLabel: string;
  department: string;
  previous: HistoryMonth | null;
}) {
  const t = report.totals;
  const projects = report.projects.filter((p) => p.revenueUsd || p.employees.length);

  const insights = useMemo(() => buildInsights(report, department, previous), [report, department, previous]);

  const barData = projects.slice(0, 12).map((p) => ({
    name: p.project,
    revenue: p.revenuePkr ?? 0,
    cost: p.directCost,
    contribution: p.contribution ?? 0,
  }));

  const marginData = projects
    .filter((p) => p.marginPct !== null)
    .map((p) => ({ name: p.project, margin: Number((p.marginPct ?? 0).toFixed(1)) }))
    .sort((a, b) => b.margin - a.margin);

  // Even ticks every 25%; room on the left of a negative bar for its label.
  const marginAxis = (() => {
    const vals = marginData.map((d) => d.margin);
    const lo = Math.min(0, ...vals) < 0 ? Math.floor((Math.min(...vals) - 25) / 25) * 25 : 0;
    const hi = Math.max(100, Math.ceil(Math.max(0, ...vals) / 25) * 25);
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += 25) ticks.push(v);
    return { lo, hi, ticks };
  })();

  const allocated = Math.max(0, t.techPayroll - t.unallocatedPayroll);
  const donut = [
    { name: "Allocated to projects", value: allocated, color: C.revenue },
    { name: "Not allocated (bench)", value: t.unallocatedPayroll, color: C.neutral },
  ];

  const prevDelta = (cur: number | null, key: keyof Totals) =>
    previous ? (() => {
      const d = pctChange(cur, previous[key] as number | null);
      return d === null ? null : { value: d, unit: "%" as const };
    })() : null;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue" value={fmtShort(t.revenuePkr)} accent={C.revenue} sub={fmtUsd(t.revenueUsd)} delta={prevDelta(t.revenuePkr, "revenuePkr")} />
        <Kpi
          label="Direct cost"
          value={fmtShort(t.directCost)}
          accent={C.cost}
          sub="Allocated salaries"
          delta={prevDelta(t.directCost, "directCost")}
          deltaGoodWhenUp={false}
        />
        <Kpi label="Contribution" value={fmtShort(t.contribution)} accent={C.contribution} sub="Revenue − direct cost" delta={prevDelta(t.contribution, "contribution")} />
        <Kpi
          label="Margin"
          value={fmtPct(t.marginPct)}
          accent={t.marginPct !== null && t.marginPct < 0 ? C.negative : C.contribution}
          sub="Contribution ÷ revenue"
          delta={previous && t.marginPct !== null && previous.marginPct !== null ? { value: t.marginPct - previous.marginPct, unit: "pts" } : null}
        />
        <Kpi label="Utilization" value={fmtPct(t.utilizationPct, 0)} accent="#9085e9" sub={`${department} payroll on projects`}>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#9085e9]" style={{ width: `${Math.min(100, Math.max(0, t.utilizationPct ?? 0))}%` }} />
          </div>
        </Kpi>
        <Kpi
          label="Bench cost"
          value={fmtShort(t.unallocatedPayroll)}
          accent={C.partial}
          sub={`${t.partiallyAllocated + t.notAllocated} of ${t.techHeadcount} not fully allocated`}
          delta={prevDelta(t.unallocatedPayroll, "unallocatedPayroll")}
          deltaGoodWhenUp={false}
        />
      </div>

      {/* Insights */}
      <Card title="Key insights" subtitle={`${monthLabel} · generated from the data on this page`}>
        <ul className="grid gap-2.5 md:grid-cols-2">
          {insights.map((i, n) => (
            <li key={n} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm text-slate-200">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ background: `${i.color}26`, color: i.color }}>
                {i.icon}
              </span>
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Charts */}
      <div className="grid gap-5 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Revenue, direct cost and contribution by project"
          subtitle={projects.length > 12 ? "Top 12 projects by revenue · PKR" : "PKR"}
          right={
            <LegendRow
              items={[
                { label: "Revenue", color: C.revenue },
                { label: "Direct cost", color: C.cost },
                { label: "Contribution", color: C.contribution },
              ]}
            />
          }
        >
          <div className="h-[320px]">
            {barData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="name" {...axisProps} interval={0} angle={barData.length > 6 ? -25 : 0} textAnchor={barData.length > 6 ? "end" : "middle"} height={barData.length > 6 ? 60 : 30} />
                  <YAxis {...axisProps} tickFormatter={(v: number) => fmtShort(v)} width={70} />
                  <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <ChartTip {...(p as unknown as TipProps)} />} />
                  <Bar dataKey="revenue" name="Revenue" fill={C.revenue} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="cost" name="Direct cost" fill={C.cost} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="contribution" name="Contribution" fill={C.contribution} radius={[4, 4, 0, 0]} maxBarSize={26}>
                    {barData.map((d) => (
                      <Cell key={d.name} fill={d.contribution < 0 ? C.negative : C.contribution} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty text="No project data for this month." />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2" title="Contribution margin by project" subtitle="Contribution ÷ revenue">
          <div style={{ height: Math.max(320, marginData.length * 30 + 40) }}>
            {marginData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `${v}%`} domain={[marginAxis.lo, marginAxis.hi]} ticks={marginAxis.ticks} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                  <ReferenceLine x={0} stroke="rgba(148,163,184,0.45)" />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={(p) => <ChartTip {...(p as unknown as TipProps)} format={(v) => `${v.toFixed(1)}%`} />}
                  />
                  <Bar dataKey="margin" name="Margin" radius={4} maxBarSize={18}>
                    {marginData.map((d) => (
                      <Cell key={d.name} fill={d.margin < 0 ? C.negative : C.contribution} />
                    ))}
                    <LabelList dataKey="margin" content={MarginLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty text="Margin shows when a project has revenue." />
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2" title={`${department} payroll utilization`} subtitle="How much of the payroll is charged to projects">
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <div className="relative h-[220px]">
              {t.techPayroll ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={(p) => <ChartTip {...(p as unknown as TipProps)} />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty text="No payroll data." />
              )}
              {t.techPayroll ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-semibold text-white">{fmtPct(t.utilizationPct, 0)}</div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">utilized</div>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 text-sm">
              <StatLine color={C.revenue} label="Allocated to projects" value={fmtPkr(allocated)} />
              <StatLine color={C.neutral} label="Not allocated (bench)" value={fmtPkr(t.unallocatedPayroll)} />
              <div className="border-t border-white/10 pt-3">
                <StatLine color="transparent" label={`${department} payroll`} value={fmtPkr(t.techPayroll)} strong />
              </div>
              <HeadcountBar t={t} />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-3" title="Direct cost share by project" subtitle="Where the allocated salary goes">
          <CostShare projects={projects} />
        </Card>
      </div>

      <ProjectTable projects={projects} totals={t} monthLabel={monthLabel} />

      <UnallocatedTable list={report.unallocated} totals={t} department={department} />
    </div>
  );
}

/** Value label at the outer end of a margin bar: right of a positive bar, left of a negative bar. */
function MarginLabel(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const w = Number(props.width ?? 0);
  const h = Number(props.height ?? 0);
  const v = Number(props.value ?? 0);
  const neg = v < 0;
  const end = neg ? Math.min(x, x + w) - 6 : Math.max(x, x + w) + 6;
  return (
    <text x={end} y={y + h / 2} dy={4} textAnchor={neg ? "end" : "start"} fill="#cbd5e1" fontSize={11}>
      {`${v.toFixed(1)}%`}
    </text>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">{text}</div>;
}

function StatLine({ color, label, value, strong }: { color: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-slate-300">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
        {label}
      </span>
      <span className={`tabular-nums ${strong ? "font-semibold text-white" : "text-slate-100"}`}>{value}</span>
    </div>
  );
}

function HeadcountBar({ t }: { t: Totals }) {
  const total = t.techHeadcount || 1;
  const parts = [
    { label: "Fully allocated", n: t.fullyAllocated, color: C.contribution },
    { label: "Partial", n: t.partiallyAllocated, color: C.partial },
    { label: "Not allocated", n: t.notAllocated, color: C.neutral },
  ];
  return (
    <div className="pt-1">
      <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-400">Headcount · {t.techHeadcount}</div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p) => (p.n ? <div key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.n}`} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-300">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label} <b className="text-white">{p.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function CostShare({ projects }: { projects: ReportProject[] }) {
  const withCost = projects.filter((p) => p.directCost > 0).sort((a, b) => b.directCost - a.directCost);
  const total = withCost.reduce((s, p) => s + p.directCost, 0);
  if (!withCost.length) return <Empty text="No salary is allocated yet." />;
  const max = withCost[0].directCost;
  return (
    <div className="space-y-2.5">
      {withCost.slice(0, 10).map((p) => (
        <div key={p.project} className="grid grid-cols-[minmax(90px,160px)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-300" title={p.project}>
            {p.project}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${(p.directCost / max) * 100}%`, background: C.cost }} />
          </div>
          <span className="w-[150px] text-right tabular-nums text-slate-100">
            {fmtShort(p.directCost)} <span className="text-slate-400">· {((p.directCost / total) * 100).toFixed(0)}%</span>
          </span>
        </div>
      ))}
      {withCost.length > 10 ? <div className="text-xs text-slate-500">+ {withCost.length - 10} more projects</div> : null}
    </div>
  );
}

type Insight = { icon: string; color: string; text: React.ReactNode };

function buildInsights(report: MonthReport, department: string, previous: HistoryMonth | null): Insight[] {
  const t = report.totals;
  const out: Insight[] = [];
  const withMargin = report.projects.filter((p) => p.marginPct !== null && p.revenueUsd > 0);

  if (withMargin.length) {
    const best = withMargin.reduce((a, b) => ((b.marginPct ?? 0) > (a.marginPct ?? 0) ? b : a));
    out.push({
      icon: "★",
      color: C.contribution,
      text: (
        <>
          <b>{best.project}</b> has the best margin: <b>{fmtPct(best.marginPct)}</b> ({fmtPkr(best.contribution)} contribution).
        </>
      ),
    });
  }

  const losing = report.projects.filter((p) => p.contribution !== null && p.contribution < 0);
  out.push(
    losing.length
      ? {
          icon: "!",
          color: C.negative,
          text: (
            <>
              <b>{losing.length}</b> project{losing.length > 1 ? "s cost" : " costs"} more than {losing.length > 1 ? "they earn" : "it earns"}:{" "}
              <b>{losing.map((p) => p.project).join(", ")}</b> ({fmtPkr(losing.reduce((s, p) => s + (p.contribution ?? 0), 0))}).
            </>
          ),
        }
      : { icon: "✓", color: C.contribution, text: <>All projects have a positive contribution.</> }
  );

  if (t.revenueUsd > 0 && report.projects.length) {
    const top = report.projects[0];
    const share = (top.revenueUsd / t.revenueUsd) * 100;
    out.push({
      icon: "◎",
      color: C.revenue,
      text: (
        <>
          <b>{top.project}</b> gives <b>{share.toFixed(0)}%</b> of the revenue{share >= 40 ? " — high dependency on one project." : "."}
        </>
      ),
    });
  }

  const noTeam = report.projects.filter((p) => p.revenueUsd > 0 && !p.employees.length);
  if (noTeam.length) {
    out.push({
      icon: "?",
      color: C.partial,
      text: (
        <>
          <b>{noTeam.length}</b> project{noTeam.length > 1 ? "s have" : " has"} revenue but no employee allocated: {noTeam.slice(0, 4).map((p) => p.project).join(", ")}
          {noTeam.length > 4 ? "…" : ""}.
        </>
      ),
    });
  }

  if (t.techHeadcount) {
    out.push({
      icon: "%",
      color: C.partial,
      text: (
        <>
          Bench cost is <b>{fmtPkr(t.unallocatedPayroll)}</b> ({fmtPct(t.techPayroll ? (t.unallocatedPayroll / t.techPayroll) * 100 : 0, 0)} of {department} payroll).{" "}
          {t.notAllocated} not allocated, {t.partiallyAllocated} partial.
        </>
      ),
    });
  }

  if (previous && previous.contribution !== null && t.contribution !== null) {
    const diff = t.contribution - previous.contribution;
    out.push({
      icon: diff >= 0 ? "▲" : "▼",
      color: diff >= 0 ? C.contribution : C.negative,
      text: (
        <>
          Contribution is {diff >= 0 ? "up" : "down"} <b>{fmtPkr(Math.abs(diff))}</b> from {previous.label}
          {t.marginPct !== null && previous.marginPct !== null ? (
            <>
              ; margin {t.marginPct >= previous.marginPct ? "up" : "down"} <b>{Math.abs(t.marginPct - previous.marginPct).toFixed(1)} pts</b>
            </>
          ) : null}
          .
        </>
      ),
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

function MarginPill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-500">—</span>;
  const neg = value < 0;
  return (
    <span className={`inline-flex min-w-[64px] justify-end rounded-md px-2 py-0.5 font-semibold tabular-nums ${neg ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/12 text-emerald-300"}`}>
      {value.toFixed(1)}%
    </span>
  );
}

function ProjectTable({ projects, totals, monthLabel }: { projects: ReportProject[]; totals: Totals; monthLabel: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <Card title="Project profitability" subtitle={`${monthLabel} · click a project to see the team and salary allocation`}>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-y border-white/[0.08] bg-white/[0.03] text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <th className="px-5 py-3">Project</th>
              <th className="px-4 py-3 text-right">Revenue (USD)</th>
              <th className="px-4 py-3 text-right">Revenue (PKR)</th>
              <th className="px-4 py-3 text-right">Team</th>
              <th className="px-4 py-3 text-right">Direct cost</th>
              <th className="px-4 py-3 text-right">Contribution</th>
              <th className="px-5 py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const isOpen = Boolean(open[p.project]);
              return (
                <React.Fragment key={p.project}>
                  <tr className="cursor-pointer border-b border-white/[0.05] transition hover:bg-white/[0.04]" onClick={() => setOpen((o) => ({ ...o, [p.project]: !o[p.project] }))}>
                    <td className="px-5 py-3 font-medium text-white">
                      <span className={`mr-2 inline-block text-slate-500 transition ${isOpen ? "rotate-90" : ""}`}>▸</span>
                      {p.project}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-400">{fmtUsd(p.revenueUsd)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(p.revenuePkr)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{p.employees.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(p.directCost)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${p.contribution !== null && p.contribution < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {fmtPkr(p.contribution)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <MarginPill value={p.marginPct} />
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-white/[0.05] bg-black/25">
                      <td colSpan={7} className="px-5 py-3">
                        {p.employees.length ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-[0.12em] text-slate-500">
                                <th className="py-1.5 pl-6">Employee</th>
                                <th className="py-1.5">Designation</th>
                                <th className="py-1.5 text-right">Gross salary</th>
                                <th className="py-1.5 text-right">Time on project</th>
                                <th className="py-1.5 text-right">Salary allocation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.employees.map((e) => (
                                <tr key={e.employeeName} className="border-t border-white/[0.05]">
                                  <td className="py-2 pl-6 text-slate-100">
                                    {e.employeeName}
                                    {e.notInSalarySheet ? <span className="ml-2 text-amber-300">(not in salary sheet)</span> : null}
                                  </td>
                                  <td className="py-2 text-slate-400">{e.designation || "—"}</td>
                                  <td className="py-2 text-right tabular-nums">{fmtPkr(e.grossSalary)}</td>
                                  <td className="py-2 text-right">
                                    <span className="inline-flex items-center gap-2">
                                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:inline-block">
                                        <span className="block h-full rounded-full" style={{ width: `${e.percentage}%`, background: C.revenue }} />
                                      </span>
                                      <span className="tabular-nums">{fmtPct(e.percentage, 0)}</span>
                                    </span>
                                  </td>
                                  <td className="py-2 text-right font-semibold tabular-nums text-white">{fmtPkr(e.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="pl-6 text-xs text-slate-400">No employee is allocated to this project yet.</div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            {!projects.length ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                  No projects in {monthLabel}.
                </td>
              </tr>
            ) : null}
          </tbody>
          {projects.length ? (
            <tfoot>
              <tr className="bg-white/[0.03] font-semibold text-white">
                <td className="px-5 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-300">{fmtUsd(totals.revenueUsd)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(totals.revenuePkr)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(totals.directCost)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${totals.contribution !== null && totals.contribution < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {fmtPkr(totals.contribution)}
                </td>
                <td className="px-5 py-3 text-right">
                  <MarginPill value={totals.marginPct} />
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Card>
  );
}

function UnallocatedTable({ list, totals, department }: { list: Unallocated[]; totals: Totals; department: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unallocated" | "partial">("all");
  const rows = list.filter(
    (u) => (filter === "all" || u.status === filter) && (!q.trim() || `${u.employeeName} ${u.designation}`.toLowerCase().includes(q.trim().toLowerCase()))
  );
  const sum = rows.reduce((s, u) => s + u.unallocatedSalary, 0);

  return (
    <Card
      title={`Unallocated ${department} resources`}
      subtitle="Employees not on a project, and employees with part of their time not allocated"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs">
            {(
              [
                ["all", `All ${list.length}`],
                ["unallocated", `Not allocated ${totals.notAllocated}`],
                ["partial", `Partial ${totals.partiallyAllocated}`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${filter === k ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search..."
            className="w-40 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300/40"
          />
        </div>
      }
    >
      {list.length ? (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-white/[0.08] bg-white/[0.03] text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                <th className="px-5 py-3">Employee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Gross salary</th>
                <th className="px-4 py-3">Allocated / not allocated</th>
                <th className="px-5 py-3 text-right">Unallocated salary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.employeeName} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                  <td className="px-5 py-2.5">
                    <div className="font-medium text-white">{u.employeeName}</div>
                    <div className="text-xs text-slate-400">{u.designation || "—"}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtPkr(u.grossSalary)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-2 w-40 gap-[2px] overflow-hidden rounded-full bg-white/[0.06]">
                        {u.allocatedPct > 0 ? <div style={{ width: `${u.allocatedPct}%`, background: C.revenue }} /> : null}
                        <div style={{ width: `${u.unallocatedPct}%`, background: C.partial }} />
                      </div>
                      <span className="whitespace-nowrap text-xs tabular-nums text-slate-300">
                        {fmtPct(u.allocatedPct, 0)} / <b className="text-amber-200">{fmtPct(u.unallocatedPct, 0)}</b>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-amber-200">{fmtPkr(u.unallocatedSalary)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                    No employee matches.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.03] font-semibold text-white">
                <td className="px-5 py-3" colSpan={4}>
                  Total unallocated salary {rows.length !== list.length ? `(${rows.length} shown)` : ""}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-amber-200">{fmtPkr(sum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          All {department} employees are 100% allocated to projects.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        <LegendRow
          items={[
            { label: "Allocated time", color: C.revenue },
            { label: "Unallocated time", color: C.partial },
          ]}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function History({
  months,
  loading,
  error,
  fx,
  onOpenMonth,
}: {
  months: HistoryMonth[];
  loading: boolean;
  error: string;
  fx: { rate: number | null; source: string } | null;
  onOpenMonth: (month: string) => void;
}) {
  if (loading && !months.length) return <Card><div className="h-60 animate-pulse rounded-xl bg-white/5" /></Card>;
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>;
  if (!months.length) {
    return (
      <Card>
        <Empty text="No saved months yet. History shows each month that has allocations." />
      </Card>
    );
  }

  const data = months.map((m) => ({
    label: m.label,
    revenue: m.revenuePkr ?? 0,
    cost: m.directCost,
    contribution: m.contribution ?? 0,
    margin: m.marginPct === null ? null : Number(m.marginPct.toFixed(1)),
    utilization: m.utilizationPct === null ? null : Number(m.utilizationPct.toFixed(1)),
    bench: m.unallocatedPayroll,
  }));

  const first = months[0];
  const last = months[months.length - 1];
  const avgMargin = months.filter((m) => m.marginPct !== null).reduce((s, m, _, a) => s + (m.marginPct ?? 0) / a.length, 0);
  const totalContribution = months.reduce((s, m) => s + (m.contribution ?? 0), 0);
  const best = months.reduce((a, b) => ((b.contribution ?? -Infinity) > (a.contribution ?? -Infinity) ? b : a));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Months saved" value={String(months.length)} accent={C.revenue} sub={`${first.label} – ${last.label}`} />
        <Kpi label="Total contribution" value={fmtShort(totalContribution)} accent={C.contribution} sub="All saved months" />
        <Kpi label="Average margin" value={fmtPct(avgMargin)} accent={avgMargin < 0 ? C.negative : C.contribution} sub="Simple average of months" />
        <Kpi label="Best month" value={best.label} accent="#9085e9" sub={`${fmtPkr(best.contribution)} contribution`} />
      </div>

      <Card
        title="Monthly trend"
        subtitle={`PKR · all months at one rate${fx?.rate ? ` (1 USD = Rs ${fx.rate.toFixed(2)})` : ""}, so the trend shows business change, not rate change`}
        right={
          <LegendRow
            items={[
              { label: "Revenue", color: C.revenue },
              { label: "Direct cost", color: C.cost },
              { label: "Contribution", color: C.contribution },
            ]}
          />
        }
      >
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => fmtShort(v)} width={70} />
              <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
              <Tooltip cursor={{ stroke: "rgba(148,163,184,0.35)" }} content={(p) => <ChartTip {...(p as unknown as TipProps)} />} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={C.revenue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#0b1224" }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="cost" name="Direct cost" stroke={C.cost} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#0b1224" }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="contribution" name="Contribution" stroke={C.contribution} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#0b1224" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Contribution margin by month" subtitle="Contribution ÷ revenue">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v: number) => `${v}%`} width={48} />
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.45)" />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <ChartTip {...(p as unknown as TipProps)} format={(v) => `${v.toFixed(1)}%`} />} />
                <Bar dataKey="margin" name="Margin" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {data.map((d) => (
                    <Cell key={d.label} fill={(d.margin ?? 0) < 0 ? C.negative : C.contribution} />
                  ))}
                  <LabelList dataKey="margin" position="top" formatter={(v: unknown) => (v === null ? "" : `${Number(v).toFixed(0)}%`)} fill="#cbd5e1" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Payroll utilization by month" subtitle="Share of Technical payroll charged to projects">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} width={48} />
                <ReferenceLine y={100} stroke="rgba(148,163,184,0.25)" strokeDasharray="4 4" />
                <Tooltip cursor={{ stroke: "rgba(148,163,184,0.35)" }} content={(p) => <ChartTip {...(p as unknown as TipProps)} format={(v) => `${v.toFixed(1)}%`} />} />
                <Line type="monotone" dataKey="utilization" name="Utilization" stroke="#9085e9" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#0b1224" }} activeDot={{ r: 6 }}>
                  <LabelList dataKey="utilization" position="top" formatter={(v: unknown) => (v === null ? "" : `${Number(v).toFixed(0)}%`)} fill="#cbd5e1" fontSize={11} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Month by month" subtitle="Click a month to open its full report">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-y border-white/[0.08] bg-white/[0.03] text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                <th className="px-5 py-3">Month</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right">Direct cost</th>
                <th className="px-4 py-3 text-right">Contribution</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3 text-right">Utilization</th>
                <th className="px-4 py-3 text-right">Bench cost</th>
                <th className="px-5 py-3 text-right">Projects</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month} className="cursor-pointer border-b border-white/[0.05] transition hover:bg-white/[0.04]" onClick={() => onOpenMonth(m.month)}>
                  <td className="px-5 py-3 font-medium text-white">
                    {m.label}
                    {!m.hasSalaryData ? <span className="ml-2 text-xs text-amber-300">(no salary data)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(m.revenuePkr)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtPkr(m.directCost)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${m.contribution !== null && m.contribution < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                    {fmtPkr(m.contribution)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MarginPill value={m.marginPct} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtPct(m.utilizationPct, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200">{fmtPkr(m.unallocatedPayroll)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-300">{m.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
