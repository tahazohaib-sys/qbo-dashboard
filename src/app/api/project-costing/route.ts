import { NextResponse } from "next/server";
import { getUsdPkrRate } from "@/lib/fx-rate";
import { getProjectCostingAccess } from "@/lib/project-costing-access";
import {
  AllocationError,
  isMonthKey,
  listAllocations,
  listRevenueMonths,
  monthLabel,
  readSalarySheet,
  revenueByTeam,
  saveAllocations,
  type Allocation,
  type AllocationInput,
  type Employee,
} from "@/lib/project-costing";

export const dynamic = "force-dynamic";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function calendarMonth(offset: number) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function monthOptions() {
  let months: string[] = [];
  try {
    months = await listRevenueMonths();
  } catch {
    months = [];
  }
  const all = Array.from(new Set([...months, calendarMonth(0), calendarMonth(-1)])).sort().reverse();
  return all.map((key) => ({ key, label: monthLabel(key) }));
}

function buildReport(
  revenue: Map<string, number>,
  allocations: Allocation[],
  employees: Employee[],
  pkrPerUsd: number | null
) {
  const byName = new Map(employees.map((e) => [e.name.toLowerCase(), e]));
  const projectNames = Array.from(new Set([...revenue.keys(), ...allocations.map((a) => a.projectName)]));

  const projects = projectNames.map((project) => {
    const revenueUsd = revenue.get(project) ?? 0;
    const revenuePkr = pkrPerUsd ? revenueUsd * pkrPerUsd : null;
    const team = allocations
      .filter((a) => a.projectName === project)
      .map((a) => {
        const emp = byName.get(a.employeeName.toLowerCase());
        const grossSalary = emp?.grossSalary ?? 0;
        return {
          employeeName: a.employeeName,
          designation: emp?.designation ?? "",
          grossSalary,
          percentage: a.percentage,
          cost: (grossSalary * a.percentage) / 100,
          notInSalarySheet: !emp,
        };
      })
      .sort((a, b) => b.cost - a.cost);
    const directCost = team.reduce((s, t) => s + t.cost, 0);
    const contribution = revenuePkr === null ? null : revenuePkr - directCost;
    const marginPct = contribution === null || !revenuePkr ? null : (contribution / revenuePkr) * 100;
    return { project, revenueUsd, revenuePkr, employees: team, directCost, contribution, marginPct };
  });
  projects.sort((a, b) => (b.revenuePkr ?? b.revenueUsd) - (a.revenuePkr ?? a.revenueUsd) || a.project.localeCompare(b.project));

  const revenueUsd = projects.reduce((s, p) => s + p.revenueUsd, 0);
  const revenuePkr = pkrPerUsd ? revenueUsd * pkrPerUsd : null;
  const directCost = projects.reduce((s, p) => s + p.directCost, 0);
  const contribution = revenuePkr === null ? null : revenuePkr - directCost;
  const totalPayroll = employees.reduce((s, e) => s + e.grossSalary, 0);

  return {
    projects,
    totals: {
      revenueUsd,
      revenuePkr,
      directCost,
      contribution,
      marginPct: contribution === null || !revenuePkr ? null : (contribution / revenuePkr) * 100,
      totalPayroll,
      unallocatedPayroll: totalPayroll - directCost,
    },
  };
}

export async function GET(req: Request) {
  const access = await getProjectCostingAccess();
  if (!access) return NextResponse.json({ ok: false, error: "You do not have access to Project Costing." }, { status: 403 });

  try {
    const url = new URL(req.url);
    const months = await monthOptions();
    const requested = String(url.searchParams.get("month") ?? "");
    const month = isMonthKey(requested) ? requested : months[0]?.key ?? calendarMonth(-1);

    const [salary, revenue, allocations] = await Promise.all([
      readSalarySheet(month).then(
        (v) => ({ ok: true as const, ...v }),
        (e) => ({ ok: false as const, error: errText(e), employees: [] as Employee[] })
      ),
      revenueByTeam(month).then(
        (v) => ({ ok: true as const, map: v }),
        (e) => ({ ok: false as const, error: errText(e), map: new Map<string, number>() })
      ),
      listAllocations(month),
    ]);

    const base = {
      ok: true,
      isAdmin: access.isAdmin,
      month,
      monthLabel: monthLabel(month),
      months,
      // Data entry users see names and designations only, not salaries.
      employees: salary.employees.map((e) => ({ name: e.name, designation: e.designation })),
      projects: Array.from(revenue.map.keys()).sort((a, b) => a.localeCompare(b)),
      allocations,
      salarySheet: salary.ok ? { fileName: salary.fileName, tabName: salary.tabName } : null,
      warnings: [salary.ok ? "" : salary.error, revenue.ok ? "" : `Revenue sheet: ${revenue.error}`].filter(Boolean),
    };

    if (!access.isAdmin) return NextResponse.json(base);

    // Admin: report in PKR. Revenue in the sheet is USD.
    const override = Number(url.searchParams.get("rate"));
    let fx: { rate: number | null; source: string; asOf: string; error?: string };
    if (Number.isFinite(override) && override > 0) {
      fx = { rate: override, source: "Manual rate", asOf: "" };
    } else {
      fx = await getUsdPkrRate().then(
        (v) => ({ ...v }),
        (e) => ({ rate: null, source: "", asOf: "", error: errText(e) })
      );
    }

    return NextResponse.json({ ...base, fx, report: buildReport(revenue.map, allocations, salary.employees, fx.rate) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errText(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const access = await getProjectCostingAccess();
  if (!access) return NextResponse.json({ ok: false, error: "You do not have access to Project Costing." }, { status: 403 });

  try {
    const body = await req.json();
    const month = String(body?.month ?? "");
    if (!isMonthKey(month)) return NextResponse.json({ ok: false, error: "Select a month." }, { status: 400 });

    type RowBody = { id?: unknown; employeeName?: unknown; projectName?: unknown; percentage?: unknown };
    const rows: AllocationInput[] = (Array.isArray(body?.rows) ? (body.rows as RowBody[]) : []).map((r) => ({
      id: Number(r?.id) > 0 ? Number(r.id) : undefined,
      employeeName: String(r?.employeeName ?? "").trim(),
      projectName: String(r?.projectName ?? "").trim(),
      percentage: Math.round(Number(r?.percentage) * 100) / 100,
    }));
    const deletedIds: number[] = (Array.isArray(body?.deletedIds) ? body.deletedIds : [])
      .map(Number)
      .filter((n: number) => Number.isInteger(n) && n > 0);

    // New and changed rows must use an employee from the salary sheet and a project of the month.
    const current = new Map((await listAllocations(month)).map((a) => [a.id, a]));
    const changed = rows.filter((r) => {
      const old = r.id ? current.get(r.id) : undefined;
      return !old || old.employeeName !== r.employeeName || old.projectName !== r.projectName;
    });
    if (changed.length) {
      const [salary, revenue] = await Promise.all([readSalarySheet(month), revenueByTeam(month)]);
      const names = new Set(salary.employees.map((e) => e.name));
      for (const r of changed) {
        if (!names.has(r.employeeName)) throw new AllocationError(`"${r.employeeName}" is not in the salary sheet of ${monthLabel(month)}.`);
        if (!revenue.has(r.projectName)) throw new AllocationError(`"${r.projectName}" is not a project in ${monthLabel(month)}.`);
      }
    }

    const allocations = await saveAllocations(month, rows, deletedIds, access.email);
    return NextResponse.json({ ok: true, allocations });
  } catch (e: unknown) {
    if (e instanceof AllocationError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    if ((e as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Another user changed the same rows. Reload the month and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: errText(e) }, { status: 500 });
  }
}
