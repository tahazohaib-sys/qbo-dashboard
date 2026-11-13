"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "@/components/SearchSelect";
import { History, Overview, type HistoryMonth, type MonthReport } from "@/components/project-costing/Reports";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Allocation = { id: number; employeeName: string; projectName: string; percentage: number; updatedBy: string | null; updatedAt: string };

type ApiData = {
  ok: true;
  isAdmin: boolean;
  month: string;
  monthLabel: string;
  months: Array<{ key: string; label: string }>;
  department: string;
  employees: Array<{ name: string; designation: string }>;
  projects: string[];
  allocations: Allocation[];
  salarySheet: { fileName: string; tabName: string; savedAt: string | null } | null;
  warnings: string[];
  fx?: { rate: number | null; source: string; asOf: string; error?: string };
  report?: MonthReport;
};

type Item = { key: string; id?: number; projectName: string; percentage: string };
type Group = { key: string; employeeName: string; items: Item[] };
type View = "overview" | "entry" | "history";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let uid = 0;
const newKey = () => `k${++uid}`;

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
  return JSON.stringify(groups.flatMap((g) => g.items.map((i) => [i.id ?? 0, g.employeeName, i.projectName, Number(i.percentage) || 0])));
}

const groupTotal = (g: Group) => g.items.reduce((s, i) => s + (Number(i.percentage) || 0), 0);

function totalTone(total: number) {
  if (total > 100.0001) return { bar: "#e66767", text: "text-rose-200", ring: "border-rose-300/30 bg-rose-500/10" };
  if (Math.abs(total - 100) < 0.0001) return { bar: "#199e70", text: "text-emerald-200", ring: "border-emerald-300/30 bg-emerald-500/10" };
  return { bar: "#c98500", text: "text-amber-200", ring: "border-amber-300/30 bg-amber-500/10" };
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "+";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ProjectCostingClient({ isAdmin }: { isAdmin: boolean }) {
  const [view, setView] = useState<View>(isAdmin ? "overview" : "entry");
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

  const [history, setHistory] = useState<HistoryMonth[]>([]);
  const [historyFx, setHistoryFx] = useState<{ rate: number | null; source: string } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

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

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const params = new URLSearchParams();
      if (rateOverride) params.set("rate", rateOverride);
      const res = await fetch(`/api/project-costing/history?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load the history.");
      setHistory(json.months || []);
      setHistoryFx(json.fx || null);
    } catch (e: unknown) {
      setHistoryError(e instanceof Error ? e.message : "Could not load the history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin, rateOverride]);

  useEffect(() => {
    load(month);
    loadHistory();
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
    if (g.items.length === 1) setGroups((gs) => gs.filter((x) => x.key !== g.key));
    else updateGroup(g.key, (x) => ({ ...x, items: x.items.filter((i) => i.key !== item.key) }));
  }

  function discard() {
    if (!window.confirm("Discard all unsaved changes?")) return;
    load(month);
  }

  async function save() {
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
      const rows = groups.flatMap((g) => g.items.map((i) => ({ id: i.id, employeeName: g.employeeName, projectName: i.projectName, percentage: Number(i.percentage) })));
      const res = await fetch("/api/project-costing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, rows, deletedIds }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save.");
      if (isAdmin) {
        await Promise.all([load(month), loadHistory()]);
      } else {
        const g = toGroups(json.allocations);
        setGroups(g);
        setDeletedIds([]);
        savedSnapshot.current = snapshot(g);
      }
      setSaveMsg({ kind: "ok", text: `Saved for ${data?.monthLabel ?? month}.` });
    } catch (e: unknown) {
      setSaveMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  function openMonth(m: string) {
    setView("overview");
    changeMonth(m);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- view data ---------------- */

  const usedEmployees = new Set(groups.map((g) => g.employeeName).filter(Boolean));
  const visibleGroups = find.trim() ? groups.filter((g) => !g.employeeName || g.employeeName.toLowerCase().includes(find.trim().toLowerCase())) : groups;
  const projectOptions = (data?.projects ?? []).map((p) => ({ value: p, label: p }));
  const monthOptions = (data?.months ?? []).map((m) => ({ value: m.key, label: m.label }));
  const fullCount = groups.filter((g) => g.employeeName && Math.abs(groupTotal(g) - 100) < 0.0001).length;
  const notEntered = (data?.employees ?? []).filter((e) => !usedEmployees.has(e.name)).length;
  const previous = useMemo(() => [...history].filter((h) => h.month < month).pop() ?? null, [history, month]);
  const department = data?.department ?? "Technical";

  const tabs: Array<{ key: View; label: string }> = isAdmin
    ? [
        { key: "overview", label: "Overview" },
        { key: "entry", label: "Data entry" },
        { key: "history", label: "History" },
      ]
    : [];

  return (
    <main className="min-h-screen bg-[#060a16] text-slate-100">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(1000px_600px_at_0%_-10%,rgba(57,135,229,0.20),transparent_60%),radial-gradient(900px_520px_at_100%_0%,rgba(25,158,112,0.14),transparent_55%),radial-gradient(700px_500px_at_50%_120%,rgba(144,133,233,0.12),transparent_60%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">
        {/* Header */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/dashboard" prefetch={false} className="text-xs font-semibold text-slate-400 transition hover:text-white">
              ← Back to Dashboard
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#3987e5] to-[#199e70] text-lg font-bold text-white shadow-[0_10px_30px_rgba(57,135,229,0.35)]">
                ₨
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-300/80">RTC League · Finance</p>
                <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">Project Costing</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {isAdmin
                ? `${department} team time per project, direct cost, contribution and margin.`
                : `Enter which ${department} employee works on which project, and the percentage of time.`}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-52">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Month</label>
              <SearchSelect className="mt-1" value={month} options={monthOptions} onChange={changeMonth} placeholder="Select month" disabled={loading && !data} />
            </div>
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm("Reload and lose unsaved changes?")) return;
                load(month);
                loadHistory();
              }}
              disabled={loading}
              className="h-[38px] rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </header>

        {/* Tabs + rate */}
        {isAdmin ? (
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <nav className="inline-flex w-fit rounded-2xl border border-white/10 bg-white/[0.04] p-1 backdrop-blur">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    view === t.key ? "bg-gradient-to-b from-white/20 to-white/10 text-white shadow-[0_6px_18px_rgba(0,0,0,0.35)]" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {t.label}
                  {t.key === "entry" && dirty ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" /> : null}
                </button>
              ))}
            </nav>
            <RateBar fx={data?.fx} rateInput={rateInput} setRateInput={setRateInput} rateOverride={rateOverride} setRateOverride={setRateOverride} />
          </div>
        ) : null}

        {/* Messages */}
        {error ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
        {data?.warnings.map((w) => (
          <div key={w} className="mt-4 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            <span>⚠</span>
            <span>{w}</span>
          </div>
        ))}

        <div className="mt-5">
          {view === "overview" && isAdmin ? (
            data?.report ? (
              <Overview report={data.report} monthLabel={data.monthLabel} department={department} previous={previous} />
            ) : (
              <LoadingBlock />
            )
          ) : null}

          {view === "history" && isAdmin ? (
            <History months={history} loading={historyLoading} error={historyError} fx={historyFx} onOpenMonth={openMonth} />
          ) : null}

          {view === "entry" ? (
            <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white">Time allocation · {data?.monthLabel ?? ""}</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    One card for each employee. Add one row for each project. The total for one employee must not be more than 100%.
                  </p>
                  {data ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Chip>{data.employees.length} {department} employees</Chip>
                      <Chip>{data.projects.length} projects in {data.monthLabel}</Chip>
                      <Chip tone="good">{fullCount} at 100%</Chip>
                      <Chip tone="warn">{notEntered} not entered</Chip>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    placeholder="Find employee in list…"
                    className="h-[38px] w-56 rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none placeholder:text-slate-500 focus:border-sky-300/40"
                  />
                  <button
                    type="button"
                    onClick={addEmployee}
                    disabled={!data}
                    className="h-[38px] rounded-xl bg-gradient-to-b from-[#3987e5] to-[#2a6fc4] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(57,135,229,0.35)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    + Add employee
                  </button>
                </div>
              </div>

              <div className="mt-5 hidden grid-cols-[110px_minmax(220px,1.2fr)_minmax(220px,1.4fr)_140px_40px] gap-3 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 lg:grid">
                <div>Month</div>
                <div>Employee name</div>
                <div>Project name</div>
                <div>Percentage</div>
                <div />
              </div>

              <div className="mt-2 space-y-3">
                {visibleGroups.map((g) => {
                  const total = groupTotal(g);
                  const tone = totalTone(total);
                  const used = new Set(g.items.map((i) => i.projectName));
                  const empOptions = (data?.employees ?? [])
                    .filter((e) => e.name === g.employeeName || !usedEmployees.has(e.name))
                    .map((e) => ({ value: e.name, label: e.name, hint: e.designation }));
                  const designation = employeeInfo.get(g.employeeName)?.designation;
                  return (
                    <div key={g.key} className="rounded-2xl border border-white/[0.08] bg-black/25 p-4 transition hover:border-white/15">
                      {g.items.map((item, idx) => (
                        <div
                          key={item.key}
                          className="grid grid-cols-1 items-start gap-2 py-1.5 sm:grid-cols-2 lg:grid-cols-[110px_minmax(220px,1.2fr)_minmax(220px,1.4fr)_140px_40px] lg:gap-3"
                        >
                          <div className="flex h-[38px] items-center text-sm text-slate-400">
                            <span className="mr-2 text-[11px] uppercase tracking-[0.14em] text-slate-500 lg:hidden">Month</span>
                            {data?.monthLabel}
                          </div>

                          <div>
                            {idx === 0 ? (
                              <div className="flex items-start gap-2">
                                <span className="mt-[3px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/40 to-emerald-500/30 text-[11px] font-bold text-white">
                                  {initials(g.employeeName)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <SearchSelect
                                    value={g.employeeName}
                                    options={empOptions}
                                    placeholder="Select employee"
                                    emptyText="No employee (or already in the list)"
                                    onChange={(v) => updateGroup(g.key, (x) => ({ ...x, employeeName: v }))}
                                  />
                                  {designation ? <div className="mt-1 px-1 text-xs text-slate-400">{designation}</div> : null}
                                  {g.employeeName && !employeeInfo.has(g.employeeName) ? (
                                    <div className="mt-1 px-1 text-xs text-amber-200">Not a {department} employee in this month&apos;s salary sheet</div>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <div className="hidden h-[38px] items-center pl-12 text-sm text-slate-600 lg:flex">↳ same employee</div>
                            )}
                          </div>

                          <div>
                            <SearchSelect
                              value={item.projectName}
                              options={projectOptions.filter((o) => o.value === item.projectName || !used.has(o.value))}
                              placeholder="Select project"
                              emptyText="No project (or already selected)"
                              onChange={(v) => updateGroup(g.key, (x) => ({ ...x, items: x.items.map((i) => (i.key === item.key ? { ...i, projectName: v } : i)) }))}
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
                                updateGroup(g.key, (x) => ({ ...x, items: x.items.map((i) => (i.key === item.key ? { ...i, percentage: e.target.value } : i)) }))
                              }
                              placeholder="0"
                              className="h-[38px] w-full rounded-xl border border-white/10 bg-black/35 pl-3 pr-8 text-right text-sm tabular-nums outline-none focus:border-sky-300/40"
                            />
                            <span className="pointer-events-none absolute right-3 top-[9px] text-sm text-slate-400">%</span>
                          </div>

                          <button
                            type="button"
                            title="Remove this row"
                            onClick={() => removeItem(g, item)}
                            className="h-[38px] rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-100"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateGroup(g.key, (x) => ({ ...x, items: [...x.items, { key: newKey(), projectName: "", percentage: "" }] }))}
                            className="rounded-lg border border-sky-300/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
                          >
                            + Add project
                          </button>
                          <button type="button" onClick={() => removeGroup(g)} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 transition hover:text-rose-200">
                            Remove employee
                          </button>
                        </div>
                        <div className={`flex items-center gap-3 rounded-full border px-3 py-1 ${tone.ring}`}>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, total)}%`, background: tone.bar }} />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${tone.text}`}>
                            {Number(total.toFixed(2))}%
                            {total > 100.0001 ? " · more than 100%" : total < 99.9999 ? ` · ${Number((100 - total).toFixed(2))}% free` : " · full"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!loading && data && !groups.length ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                    <div className="text-sm text-slate-300">No allocations for {data.monthLabel} yet.</div>
                    <div className="mt-1 text-xs text-slate-500">Click “+ Add employee” to start.</div>
                  </div>
                ) : null}
              </div>

              {/* Save bar */}
              <div className="sticky bottom-3 z-20 mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b1224]/95 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur md:flex-row md:items-center md:justify-between">
                <div className="px-1 text-sm">
                  {saveMsg ? (
                    <span className={saveMsg.kind === "ok" ? "text-emerald-300" : "text-rose-200"}>
                      {saveMsg.kind === "ok" ? "✓ " : "✕ "}
                      {saveMsg.text}
                    </span>
                  ) : dirty ? (
                    <span className="text-amber-200">● You have unsaved changes.</span>
                  ) : (
                    <span className="text-slate-400">All changes are saved.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={discard}
                    disabled={!dirty || saving}
                    className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={!dirty || saving}
                    className="rounded-xl bg-gradient-to-b from-[#1fb380] to-[#168a62] px-6 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(25,158,112,0.35)] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        {data?.salarySheet ? (
          <div className="mt-6 text-center text-xs text-slate-600">
            Salary data: {data.salarySheet.fileName.trim()} · tab “{data.salarySheet.tabName}” · {department} department only
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Small parts                                                         */
/* ------------------------------------------------------------------ */

function Chip({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  const cls =
    tone === "good"
      ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/20 bg-amber-500/10 text-amber-100"
        : "border-white/10 bg-white/[0.05] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 ${cls}`}>{children}</span>;
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.05]" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white/[0.05]" />
    </div>
  );
}

function RateBar({
  fx,
  rateInput,
  setRateInput,
  rateOverride,
  setRateOverride,
}: {
  fx: ApiData["fx"];
  rateInput: string;
  setRateInput: (v: string) => void;
  rateOverride: string;
  setRateOverride: (v: string) => void;
}) {
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(rateInput);
        setRateOverride(n > 0 ? String(n) : "");
      }}
    >
      <span className="text-slate-400">USD → PKR</span>
      {fx?.rate ? (
        <span className="font-semibold tabular-nums text-white" title={`${fx.source}${fx.asOf ? `, ${fx.asOf}` : ""}`}>
          Rs {fx.rate.toFixed(2)}
          <span className="ml-1 text-xs font-normal text-slate-500">{fx.source === "Manual rate" ? "manual" : "market"}</span>
        </span>
      ) : (
        <span className="text-amber-200">no market rate</span>
      )}
      <input
        value={rateInput}
        onChange={(e) => setRateInput(e.target.value)}
        inputMode="decimal"
        placeholder="Manual rate"
        className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm outline-none focus:border-sky-300/40"
      />
      <button type="submit" className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/15">
        Use
      </button>
      {rateOverride ? (
        <button
          type="button"
          onClick={() => {
            setRateInput("");
            setRateOverride("");
          }}
          className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-white"
        >
          Reset
        </button>
      ) : null}
    </form>
  );
}
