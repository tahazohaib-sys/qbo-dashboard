// Month-by-month history of Project Costing (admin only).
// Each month uses its saved salary copy (or the sheet when there is no copy),
// its revenue from the revenue sheet and one USD -> PKR rate for all months,
// so that the trend shows the business change, not the rate change.
import { NextResponse } from "next/server";
import { getUsdPkrRate } from "@/lib/fx-rate";
import { getProjectCostingAccess } from "@/lib/project-costing-access";
import {
  listAllAllocations,
  loadSalarySnapshot,
  monthLabel,
  readSalarySheet,
  revenueByTeam,
  technicalEmployees,
} from "@/lib/project-costing";
import { buildMonthReport } from "@/lib/project-costing-report";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const access = await getProjectCostingAccess();
  if (!access?.isAdmin) return NextResponse.json({ ok: false, error: "Only the admin can see the history." }, { status: 403 });

  try {
    const url = new URL(req.url);
    const override = Number(url.searchParams.get("rate"));
    const fx =
      Number.isFinite(override) && override > 0
        ? { rate: override, source: "Manual rate", asOf: "" }
        : await getUsdPkrRate().catch(() => ({ rate: null as number | null, source: "", asOf: "" }));

    const allocations = await listAllAllocations();
    const months = Array.from(new Set(allocations.map((a) => a.month))).sort();

    const rows = await Promise.all(
      months.map(async (month) => {
        const sheet = (await loadSalarySnapshot(month)) ?? (await readSalarySheet(month).catch(() => null));
        const revenue = await revenueByTeam(month).catch(() => new Map<string, number>());
        const monthAlloc = allocations.filter((a) => a.month === month);
        const report = buildMonthReport(revenue, monthAlloc, sheet?.employees ?? [], sheet ? technicalEmployees(sheet) : [], fx.rate);
        return {
          month,
          label: monthLabel(month),
          hasSalaryData: Boolean(sheet),
          ...report.totals,
          projects: report.projects.map((p) => ({
            project: p.project,
            revenuePkr: p.revenuePkr,
            directCost: p.directCost,
            contribution: p.contribution,
            marginPct: p.marginPct,
          })),
        };
      })
    );

    return NextResponse.json({ ok: true, fx, months: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
