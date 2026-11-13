import { NextResponse } from "next/server";
import { getUsdPkrRate } from "@/lib/fx-rate";
import { getProjectCostingAccess } from "@/lib/project-costing-access";
import {
  AllocationConflictError,
  AllocationError,
  isMonthKey,
  listAllocations,
  listRevenueMonths,
  monthLabel,
  readSalarySheet,
  revenueByTeam,
  saveAllocations,
  technicalEmployees,
  costingDepartment,
  type AllocationInput,
  type SalarySheet,
} from "@/lib/project-costing";
import { buildMonthReport } from "@/lib/project-costing-report";

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
        (v) => ({ ok: true as const, sheet: v }),
        (e) => ({ ok: false as const, error: errText(e), sheet: null as SalarySheet | null })
      ),
      revenueByTeam(month).then(
        (v) => ({ ok: true as const, map: v }),
        (e) => ({ ok: false as const, error: errText(e), map: new Map<string, number>() })
      ),
      listAllocations(month),
    ]);

    const all = salary.sheet?.employees ?? [];
    const technical = salary.sheet ? technicalEmployees(salary.sheet) : [];
    const warnings = [salary.ok ? "" : salary.error, revenue.ok ? "" : `Revenue sheet: ${revenue.error}`];
    if (salary.sheet && !salary.sheet.hasDepartment) {
      warnings.push(`The salary sheet has no Department column, so all employees are shown (not only ${costingDepartment()}).`);
    }
    if (salary.sheet?.savedAt) {
      warnings.push(`Google Sheets could not be read. The copy saved on ${salary.sheet.savedAt.slice(0, 10)} is used.`);
    }

    const base = {
      ok: true,
      isAdmin: access.isAdmin,
      month,
      monthLabel: monthLabel(month),
      months,
      // Data entry users see names and designations only, not salaries.
      department: costingDepartment(),
      employees: technical.map((e) => ({ name: e.name, designation: e.designation })),
      projects: Array.from(revenue.map.keys()).sort((a, b) => a.localeCompare(b)),
      allocations,
      salarySheet: salary.sheet ? { fileName: salary.sheet.fileName, tabName: salary.sheet.tabName, savedAt: salary.sheet.savedAt ?? null } : null,
      warnings: warnings.filter(Boolean),
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

    return NextResponse.json({ ...base, fx, report: buildMonthReport(revenue.map, allocations, all, technical, fx.rate) });
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
      const names = new Set(technicalEmployees(salary).map((e) => e.name));
      for (const r of changed) {
        if (!names.has(r.employeeName)) {
          throw new AllocationError(`"${r.employeeName}" is not a ${costingDepartment()} employee in the salary sheet of ${monthLabel(month)}.`);
        }
        if (!revenue.has(r.projectName)) throw new AllocationError(`"${r.projectName}" is not a project in ${monthLabel(month)}.`);
      }
    }

    const versions: Record<string, string> = {};
    if (body?.versions && typeof body.versions === "object") {
      for (const [k, v] of Object.entries(body.versions as Record<string, unknown>)) if (typeof v === "string") versions[k] = v;
    }

    const allocations = await saveAllocations(month, rows, deletedIds, versions, access.email);
    return NextResponse.json({ ok: true, allocations });
  } catch (e: unknown) {
    if (e instanceof AllocationConflictError) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
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
