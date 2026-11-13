"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "@/components/SearchSelect";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Allocation = { id: number; employeeName: string; projectName: string; percentage: number; updatedBy: string | null; updatedAt: string };

type ReportEmployee = {
  employeeName: string;
  designation: string;
  grossSalary: number;
  percentage: number;
  cost: number;
  notInSalarySheet: boolean;
};

type ReportProject = {
  project: string;
  revenueUsd: number;
  revenuePkr: number | null;
  employees: ReportEmployee[];
  directCost: number;
  contribution: number | null;
  marginPct: number | null;
};

type ApiData = {
  ok: true;
  isAdmin: boolean;
  month: string;
  monthLabel: string;
  months: Array<{ key: string; label: string }>;
  employees: Array<{ name: string; designation: string }>;
  projects: string[];
  allocations: Allocation[];
  salarySheet: { fileName: string; tabName: string } | null;
  warnings: string[];
  fx?: { rate: number | null; source: string; asOf: string; error?: string };
  report?: {
    projects: ReportProject[];
    totals: {
      revenueUsd: number;
      revenuePkr: number | null;
      directCost: number;
      contribution: number | null;
      marginPct: number | null;
      totalPayroll: number;
      unallocatedPayroll: number;
    };
  };
};

type Item = { key: string; id?: number; projectName: string; percentage: string };
type Group = { key: string; employeeName: string; items: Item[] };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let uid = 0;
const newKey = () => `k${++uid}`;

const pkr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n < 0 ? "-" : ""}Rs ${Math.round(Math.abs(n)).toLocaleString("en")}`;
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en")}`;
const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${n.toFixed(digits)}%`);

function toGroups(allocations: Allocation[]): Group[] {
  const map = new Map<string, Group>();
  for (const a of allocations) {
    if (!map.has(a.employeeName)) map.set(a.employeeName, { key: newKey(), employeeName: a.employeeName, items: [] });
    map.get(a.employeeName)!.items.push({ key: newKey(), id: a.id, projectName: a.projectName, percentage: String(a.percentage) });
  }
  return Array.from(map.values());
}

/** Rows in a stable form, to see if there are unsaved changes. */
function snapshot(groups: Group[]) {
  return JSON.stringify(
    groups.flatMap((g) => g.items.map((i) => [i.id ?? 0, g.employeeName, i.projectName, Number(i.percentage) || 0]))
  );
}

function groupTotal(g: Group) {
  return g.items.reduce((s, i) => s + (Number(i.percentage) || 0), 0);
}

function totalClass(total: number) {
  if (total > 100.0001) return "border-rose-300/30 bg-rose-500/15 text-rose-100";
  if (Math.abs(total - 100) < 0.0001) return "border-emerald-300/30 bg-emerald-500/15 text-emerald-100";
  return "border-amber-300/30 bg-amber-500/15 text-amber-100";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ProjectCostingClient({ isAdmin }: { isAdmin: boolean }) {
  const [month, setMonth] = useState("");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [groups, setGroups] = useState<Group[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const savedSnapshot = useRef("[]");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [find, setFind] = useState("");

  const [rateInput, setRateInput] = useState("");
  const [rateOverride, setRateOverride] = useState("");

  const dirty = snapshot(groups) !== savedSnapshot.current || deletedIds.length > 0;

  const load = useCallback(
    async (m: string) => {
      setLoading(true);
      setError("");
      setSaveMsg(null);
      try {
        const params = new URLSearchParams();
        if (m) params.set("month", m);
        if (isAdmin && rateOverride) params.set("rate", rateOverride);
        const res = await fetch(`/api/project-costing?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load Project Costing.");
        const d = json as ApiData;
        setData(d);
        setMonth(d.month);
        const g = toGroups(d.allocations);
        setGroups(g);
        setDeletedIds([]);
        savedSnapshot.current = snapshot(g);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not load Project Costing.");
      } finally {
        setLoading(false);
      }
    },
    [isAdmin, rateOverride]
  );

  useEffect(() => {
    load(month);
  }, [rateOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function changeMonth(m: string) {
    if (m === month) return;
    if (dirty && !window.confirm("You have unsaved changes. Change the month and lose them?")) return;
    load(m);
  }

  /* ---------------- editing ---------------- */

  const employeeInfo = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.name, e])), [data]);

  function updateGroup(key: string, fn: (g: Group) => Group) {
    setGroups((gs) => gs.map((g) => (g.key === key ? fn(g) : g)));
    setSaveMsg(null);
  }

  function addEmployee() {
    setGroups((gs) => [{ key: newKey(), employeeName: "", items: [{ key: newKey(), projectName: "", percentage: "" }] }, ...gs]);
    setFind("");
    setSaveMsg(null);
  }

  function removeGroup(g: Group) {
    const ids = g.items.map((i) => i.id).filter((x): x is number => Boolean(x));
    if (ids.length) setDeletedIds((d) => [...d, ...ids]);
    setGroups((gs) => gs.filter((x) => x.key !== g.key));
    setSaveMsg(null);
  }

  function removeItem(g: Group, item: Item) {
    if (item.id) setDeletedIds((d) => [...d, item.id!]);
    if (g.items.length === 1) {
      setGroups((gs) => gs.filter((x) => x.key !== g.key));
    } else {
      updateGroup(g.key, (x) => ({ ...x, items: x.items.filter((i) => i.key !== item.key) }));
    }
  }

  function discard() {
    if (!window.confirm("Discard all unsaved changes?")) return;
    load(month);
  }

  async function save() {
    // Checks before the request, so the user sees the problem at once.
    for (const g of groups) {
      if (!g.employeeName) return setSaveMsg({ kind: "err", text: "Select an employee for each block." });
      for (const i of g.items) {
        if (!i.projectName) return setSaveMsg({ kind: "err", text: `Select a project for each row of ${g.employeeName}.` });
        const p = Number(i.percentage);
        if (!(p > 0 && p <= 100)) return setSaveMsg({ kind: "err", text: `Type a percentage from 0.01 to 100 for ${g.employeeName} / ${i.projectName}.` });
      }
      if (groupTotal(g) > 100.0001) return setSaveMsg({ kind: "err", text: `Total for ${g.employeeName} is more than 100%.` });
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      const rows = groups.flatMap((g) =>
        g.items.map((i) => ({ id: i.id, employeeName: g.employeeName, projectName: i.projectName, percentage: Number(i.percentage) }))
      );
      const res = await fetch("/api/project-costing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, rows, deletedIds }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      if (isAdmin) {
        await load(month); // The report changes too.
      } else {
        const g = toGroups(json.allocations);
        setGroups(g);
        setDeletedIds([]);
        savedSnapshot.current = snapshot(g);
      }
      setSaveMsg({ kind: "ok", text: "Saved." });
    } catch (e: unknown) {
      setSaveMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- view ---------------- */

  const usedEmployees = new Set(groups.map((g) => g.employeeName).filter(Boolean));
  const visibleGroups = find.trim()
    ? groups.filter((g) => !g.employeeName || g.employeeName.toLowerCase().includes(find.trim().toLowerCase()))
    : groups;

  const projectOptions = (data?.projects ?? []).map((p) => ({ value: p, label: p }));
  const monthOptions = (data?.months ?? []).map((m) => ({ value: m.key, label: m.label }));

  const fullCount = groups.filter((g) => g.employeeName && Math.abs(groupTotal(g) - 100) < 0.0001).length;
  const notEntered = (data?.employees ?? []).filter((e) => !usedEmployees.has(e.name)).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(900px_600px_at_10%_-10%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(800px_500px_at_95%_5%,rgba(16,185,129,0.12),transparent_55%),#050814] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Project Costing</h1>
            <p className="mt-1 text-sm text-slate-400">
              {isAdmin ? "Employee time per project · direct cost · contribution margin" : "Enter which employee works on which project, and the percentage of time."}
            </p>
            <div className="mt-2 h-[2px] w-32 rounded-full bg-gradient-to-r from-violet-400/80 via-sky-400/60 to-transparent" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" prefetch={false} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10">
              ← Back to Dashboard
            </Link>
            <button
              type="button"
              onClick={() => (dirty && !window.confirm("Reload and lose unsaved changes?") ? null : load(month))}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-violet-500/15 px-4 py-2 text-sm font-semibold hover:bg-violet-500/20 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Month */}
        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="w-full md:w-64">
            <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">Month</label>
            <SearchSelect className="mt-1" value={month} options={monthOptions} onChange={changeMonth} placeholder="Select month" disabled={loading && !data} />
          </div>
          {data ? (
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{data.employees.length} employees in salary sheet</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{data.projects.length} projects in {data.monthLabel}</span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">{fullCount} at 100%</span>
              <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-amber-100">{notEntered} not entered</span>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
        {data?.warnings.map((w) => (
          <div key={w} className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {w}
          </div>
        ))}
        {data?.salarySheet ? (
          <div className="mt-3 text-xs text-slate-500">
            Salary data: {data.salarySheet.fileName} · tab “{data.salarySheet.tabName}”
          </div>
        ) : null}

        {/* Admin report */}
        {isAdmin && data?.report ? (
          <AdminReport
            data={data}
            rateInput={rateInput}
            setRateInput={setRateInput}
            rateOverride={rateOverride}
            setRateOverride={setRateOverride}
          />
        ) : null}

        {/* Data entry */}
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Time allocation · {data?.monthLabel ?? ""}</h2>
              <p className="text-xs text-slate-400">One block for each employee. Add one row for each project. The total for one employee must not be more than 100%.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find employee in list..."
                className="w-56 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300/40"
              />
              <button
                type="button"
                onClick={addEmployee}
                disabled={!data}
                className="rounded-xl border border-violet-300/30 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-50 hover:bg-violet-500/30 disabled:opacity-50"
              >
                + Add employee
              </button>
            </div>
          </div>

          {/* Column header (wide screens) */}
          <div className="mt-5 hidden grid-cols-[110px_minmax(220px,1.2fr)_minmax(220px,1.4fr)_130px_40px] gap-3 px-3 text-[11px] uppercase tracking-[0.14em] text-slate-400 lg:grid">
            <div>Month</div>
            <div>Employee name</div>
            <div>Project name</div>
            <div>Percentage</div>
            <div />
          </div>

          <div className="mt-2 space-y-3">
            {visibleGroups.map((g) => {
              const total = groupTotal(g);
              const used = new Set(g.items.map((i) => i.projectName));
              const empOptions = (data?.employees ?? [])
                .filter((e) => e.name === g.employeeName || !usedEmployees.has(e.name))
                .map((e) => ({ value: e.name, label: e.name, hint: e.designation }));
              const designation = employeeInfo.get(g.employeeName)?.designation;
              return (
                <div key={g.key} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  {g.items.map((item, idx) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-1 items-start gap-2 border-white/5 py-1.5 sm:grid-cols-2 lg:grid-cols-[110px_minmax(220px,1.2fr)_minmax(220px,1.4fr)_130px_40px] lg:gap-3"
                    >
                      <div className="flex h-[38px] items-center text-sm text-slate-300">
                        <span className="mr-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 lg:hidden">Month</span>
                        {data?.monthLabel}
                      </div>

                      <div>
                        {idx === 0 ? (
                          <>
                            <SearchSelect
                              value={g.employeeName}
                              options={empOptions}
                              placeholder="Select employee"
                              emptyText="No employee (or already in the list)"
                              onChange={(v) => updateGroup(g.key, (x) => ({ ...x, employeeName: v }))}
                            />
                            {designation ? <div className="mt-1 px-1 text-xs text-slate-400">{designation}</div> : null}
                            {g.employeeName && !employeeInfo.has(g.employeeName) ? (
                              <div className="mt-1 px-1 text-xs text-amber-200">Not in this month&apos;s salary sheet</div>
                            ) : null}
                          </>
                        ) : (
                          <div className="hidden h-[38px] items-center px-3 text-sm text-slate-500 lg:flex">↳ same employee</div>
                        )}
                      </div>

                      <div>
                        <SearchSelect
                          value={item.projectName}
                          options={projectOptions.filter((o) => o.value === item.projectName || !used.has(o.value))}
                          placeholder="Select project"
                          emptyText="No project (or already selected)"
                          onChange={(v) =>
                            updateGroup(g.key, (x) => ({ ...x, items: x.items.map((i) => (i.key === item.key ? { ...i, projectName: v } : i)) }))
                          }
                        />
                        {item.projectName && data && !data.projects.includes(item.projectName) ? (
                          <div className="mt-1 px-1 text-xs text-amber-200">No revenue for this project in {data.monthLabel}</div>
                        ) : null}
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step="any"
                          value={item.percentage}
                          onChange={(e) =>
                            updateGroup(g.key, (x) => ({
                              ...x,
                              items: x.items.map((i) => (i.key === item.key ? { ...i, percentage: e.target.value } : i)),
                            }))
                          }
                          placeholder="0"
                          className="w-full rounded-xl border border-white/10 bg-black/35 py-2 pl-3 pr-8 text-right text-sm outline-none focus:border-cyan-300/40"
                        />
                        <span className="pointer-events-none absolute right-3 top-2 text-sm text-slate-400">%</span>
                      </div>

                      <button
                        type="button"
                        title="Remove this row"
                        onClick={() => removeItem(g, item)}
                        className="h-[38px] rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateGroup(g.key, (x) => ({ ...x, items: [...x.items, { key: newKey(), projectName: "", percentage: "" }] }))}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold hover:bg-white/10"
                      >
                        + Add project
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGroup(g)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 hover:text-rose-100"
                      >
                        Remove employee
                      </button>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${totalClass(total)}`}>
                      Total {Number(total.toFixed(2))}%{total > 100.0001 ? " — more than 100%" : total < 99.9999 ? ` — ${Number((100 - total).toFixed(2))}% not allocated` : ""}
                    </span>
                  </div>
                </div>
              );
            })}

            {!loading && data && !groups.length ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
                No data for {data.monthLabel}. Click “+ Add employee” to start.
              </div>
            ) : null}
          </div>

          {/* Save bar */}
          <div className="sticky bottom-3 z-20 mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1224]/95 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              {saveMsg ? (
                <span className={saveMsg.kind === "ok" ? "text-emerald-300" : "text-rose-200"}>{saveMsg.text}</span>
              ) : dirty ? (
                <span className="text-amber-200">You have unsaved changes.</span>
              ) : (
                <span className="text-slate-400">All changes are saved.</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={!dirty || saving}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="rounded-xl border border-emerald-300/30 bg-emerald-500/25 px-5 py-2 text-sm font-semibold text-emerald-50 hover:bg-emerald-500/35 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Admin report                                                        */
/* ------------------------------------------------------------------ */

function Kpi({ label, value, sub, tone = "slate" }: { label: string; value: string; sub?: string; tone?: "slate" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-slate-50";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function AdminReport({
  data,
  rateInput,
  setRateInput,
  rateOverride,
  setRateOverride,
}: {
  data: ApiData;
  rateInput: string;
  setRateInput: (v: string) => void;
  rateOverride: string;
  setRateOverride: (v: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const report = data.report!;
  const t = report.totals;
  const fx = data.fx;
  const tone = (n: number | null) => (n === null ? "slate" : n >= 0 ? "good" : "bad");

  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
        <div className="text-sm">
          <span className="text-slate-400">USD → PKR rate: </span>
          {fx?.rate ? (
            <span className="font-semibold">
              1 USD = Rs {fx.rate.toFixed(2)}{" "}
              <span className="font-normal text-slate-400">
                ({fx.source}
                {fx.asOf ? `, ${fx.asOf}` : ""})
              </span>
            </span>
          ) : (
            <span className="text-amber-200">No market rate ({fx?.error}). Type a rate.</span>
          )}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(rateInput);
            setRateOverride(n > 0 ? String(n) : "");
          }}
        >
          <input
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            inputMode="decimal"
            placeholder="Manual rate"
            className="w-32 rounded-xl border border-white/10 bg-black/35 px-3 py-1.5 text-sm outline-none focus:border-cyan-300/40"
          />
          <button type="submit" className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15">
            Use
          </button>
          {rateOverride ? (
            <button
              type="button"
              onClick={() => {
                setRateInput("");
                setRateOverride("");
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
            >
              Market rate
            </button>
          ) : null}
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Project revenue" value={pkr(t.revenuePkr)} sub={usd(t.revenueUsd)} />
        <Kpi label="Total direct cost" value={pkr(t.directCost)} sub="Allocated salaries" />
        <Kpi label="Contribution" value={pkr(t.contribution)} tone={tone(t.contribution)} />
        <Kpi label="Contribution margin" value={pct(t.marginPct)} tone={tone(t.marginPct)} />
        <Kpi label="Payroll not allocated" value={pkr(t.unallocatedPayroll)} sub={`of ${pkr(t.totalPayroll)} gross payroll`} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-slate-400">
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3 text-right">Revenue (USD)</th>
              <th className="px-4 py-3 text-right">Revenue (PKR)</th>
              <th className="px-4 py-3 text-right">Employees</th>
              <th className="px-4 py-3 text-right">Total direct cost</th>
              <th className="px-4 py-3 text-right">Contribution</th>
              <th className="px-4 py-3 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {report.projects.map((p) => {
              const isOpen = Boolean(open[p.project]);
              return (
                <React.Fragment key={p.project}>
                  <tr
                    className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                    onClick={() => setOpen((o) => ({ ...o, [p.project]: !o[p.project] }))}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      <span className="mr-2 inline-block w-3 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                      {p.project}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{usd(p.revenueUsd)}</td>
                    <td className="px-4 py-2.5 text-right">{pkr(p.revenuePkr)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300">{p.employees.length}</td>
                    <td className="px-4 py-2.5 text-right">{pkr(p.directCost)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${p.contribution !== null && p.contribution < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {pkr(p.contribution)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${p.marginPct !== null && p.marginPct < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {pct(p.marginPct)}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-white/5 bg-black/25">
                      <td colSpan={7} className="px-4 py-3">
                        {p.employees.length ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left uppercase tracking-[0.12em] text-slate-500">
                                <th className="py-1.5 pl-6">Employee</th>
                                <th className="py-1.5">Designation</th>
                                <th className="py-1.5 text-right">Gross salary</th>
                                <th className="py-1.5 text-right">% on project</th>
                                <th className="py-1.5 pr-2 text-right">Salary allocation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.employees.map((e) => (
                                <tr key={e.employeeName} className="border-t border-white/5">
                                  <td className="py-1.5 pl-6">
                                    {e.employeeName}
                                    {e.notInSalarySheet ? <span className="ml-2 text-amber-300">(not in salary sheet)</span> : null}
                                  </td>
                                  <td className="py-1.5 text-slate-400">{e.designation || "—"}</td>
                                  <td className="py-1.5 text-right">{pkr(e.grossSalary)}</td>
                                  <td className="py-1.5 text-right">{pct(e.percentage, 2)}</td>
                                  <td className="py-1.5 pr-2 text-right font-semibold">{pkr(e.cost)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-white/10">
                                <td colSpan={4} className="py-1.5 pl-6 font-semibold text-slate-300">
                                  Total direct cost
                                </td>
                                <td className="py-1.5 pr-2 text-right font-semibold">{pkr(p.directCost)}</td>
                              </tr>
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
            {!report.projects.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No projects in {data.monthLabel}.
                </td>
              </tr>
            ) : null}
          </tbody>
          {report.projects.length ? (
            <tfoot>
              <tr className="border-t border-white/15 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right text-slate-300">{usd(t.revenueUsd)}</td>
                <td className="px-4 py-3 text-right">{pkr(t.revenuePkr)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right">{pkr(t.directCost)}</td>
                <td className={`px-4 py-3 text-right ${t.contribution !== null && t.contribution < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {pkr(t.contribution)}
                </td>
                <td className={`px-4 py-3 text-right ${t.marginPct !== null && t.marginPct < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {pct(t.marginPct)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
