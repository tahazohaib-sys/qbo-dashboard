// Report math for Project Costing. Amounts are PKR unless the name says USD.
import type { Allocation, Employee } from "@/lib/project-costing";

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

export type UnallocatedResource = {
  employeeName: string;
  designation: string;
  grossSalary: number;
  allocatedPct: number;
  unallocatedPct: number;
  unallocatedSalary: number;
  status: "unallocated" | "partial";
};

export type ReportTotals = {
  revenueUsd: number;
  revenuePkr: number | null;
  directCost: number;
  contribution: number | null;
  marginPct: number | null;
  /** Gross salary of all Technical employees. */
  techPayroll: number;
  /** Salary of Technical employees that is not allocated to a project. */
  unallocatedPayroll: number;
  /** Allocated Technical salary / Technical payroll × 100. */
  utilizationPct: number | null;
  techHeadcount: number;
  fullyAllocated: number;
  partiallyAllocated: number;
  notAllocated: number;
  projectCount: number;
};

export type MonthReport = { projects: ReportProject[]; unallocated: UnallocatedResource[]; totals: ReportTotals };

const EPS = 0.0001;

/**
 * revenue: USD per project (team) of the month.
 * allEmployees: all employees of the salary sheet (salary lookup).
 * technical: the employees that must be allocated (unallocated list, utilization).
 */
export function buildMonthReport(
  revenue: Map<string, number>,
  allocations: Allocation[],
  allEmployees: Employee[],
  technical: Employee[],
  pkrPerUsd: number | null
): MonthReport {
  const byName = new Map(allEmployees.map((e) => [e.name.toLowerCase(), e]));
  const projectNames = Array.from(new Set([...revenue.keys(), ...allocations.map((a) => a.projectName)]));

  const projects: ReportProject[] = projectNames.map((project) => {
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
  projects.sort((a, b) => b.revenueUsd - a.revenueUsd || a.project.localeCompare(b.project));

  // Percentage allocated for each employee in the month.
  const allocatedPct = new Map<string, number>();
  for (const a of allocations) {
    const k = a.employeeName.toLowerCase();
    allocatedPct.set(k, (allocatedPct.get(k) ?? 0) + a.percentage);
  }

  let fullyAllocated = 0;
  let partiallyAllocated = 0;
  let notAllocated = 0;
  const unallocated: UnallocatedResource[] = [];
  for (const e of technical) {
    const pct = Math.min(100, allocatedPct.get(e.name.toLowerCase()) ?? 0);
    if (pct >= 100 - EPS) {
      fullyAllocated++;
      continue;
    }
    if (pct > EPS) partiallyAllocated++;
    else notAllocated++;
    const unallocatedPct = 100 - pct;
    unallocated.push({
      employeeName: e.name,
      designation: e.designation,
      grossSalary: e.grossSalary,
      allocatedPct: pct,
      unallocatedPct,
      unallocatedSalary: (e.grossSalary * unallocatedPct) / 100,
      status: pct > EPS ? "partial" : "unallocated",
    });
  }
  unallocated.sort((a, b) => b.unallocatedSalary - a.unallocatedSalary);

  const revenueUsd = projects.reduce((s, p) => s + p.revenueUsd, 0);
  const revenuePkr = pkrPerUsd ? revenueUsd * pkrPerUsd : null;
  const directCost = projects.reduce((s, p) => s + p.directCost, 0);
  const contribution = revenuePkr === null ? null : revenuePkr - directCost;
  const techPayroll = technical.reduce((s, e) => s + e.grossSalary, 0);
  const unallocatedPayroll = unallocated.reduce((s, u) => s + u.unallocatedSalary, 0);

  return {
    projects,
    unallocated,
    totals: {
      revenueUsd,
      revenuePkr,
      directCost,
      contribution,
      marginPct: contribution === null || !revenuePkr ? null : (contribution / revenuePkr) * 100,
      techPayroll,
      unallocatedPayroll,
      utilizationPct: techPayroll ? ((techPayroll - unallocatedPayroll) / techPayroll) * 100 : null,
      techHeadcount: technical.length,
      fullyAllocated,
      partiallyAllocated,
      notAllocated,
      projectCount: projects.filter((p) => p.revenueUsd || p.employees.length).length,
    },
  };
}
