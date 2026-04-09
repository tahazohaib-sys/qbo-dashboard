// src/app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type PnlTotals = {
  revenue: number;        // Income section total
  expenses: number;       // Expenses section total
  otherExpenses: number;  // OtherExpenses section total
  profit: number;         // NetIncome section total (Net Earnings)
};

function moneyToNumber(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Local YYYY-MM-DD (prevents UTC shifting)
function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date | null {
  // expects YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * SAFE: Read ONLY SECTION Summary total for a specific QBO group.
 * No fallback to row.ColData for sections (prevents leaked/wrong totals).
 * Blank/dash Summary -> 0 (matches QBO UI showing "-").
 */
function findSectionSummaryTotalByGroup(rows: any, targetGroup: string): number | null {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!Array.isArray(arr)) return null;

  for (const r of arr) {
    const group = String(r?.group ?? "");
    const type = String(r?.type ?? "");

    if (group === targetGroup && type === "Section") {
      const cd = r?.Summary?.ColData;
      if (Array.isArray(cd) && cd.length > 0) {
        const last = cd[cd.length - 1];
        return moneyToNumber(last?.value);
      }
      return 0;
    }

    if (r?.Rows) {
      const hit = findSectionSummaryTotalByGroup(r.Rows, targetGroup);
      if (hit != null) return hit;
    }
  }

  return null;
}

async function fetchMonthlyPnlTotals(
  start_date: string,
  end_date: string,
  accounting_method: "Accrual" | "Cash" = "Accrual"
): Promise<{ totals: PnlTotals; currency: string }> {
  const pnl = await qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}` +
      `&summarize_column_by=Total`
  );

  const currency = pnl?.Header?.Currency ?? "PKR";
  const rows = pnl?.Rows;

  const income = findSectionSummaryTotalByGroup(rows, "Income");
  const expenses = findSectionSummaryTotalByGroup(rows, "Expenses");
  const otherExpenses = findSectionSummaryTotalByGroup(rows, "OtherExpenses");
  const netIncome = findSectionSummaryTotalByGroup(rows, "NetIncome");

  const revenueNum = income ?? 0;
  const expensesNum = expenses ?? 0;
  const otherExpensesNum = otherExpenses ?? 0;

  const profitNum =
    netIncome != null ? netIncome : revenueNum - expensesNum - otherExpensesNum;

  return {
    totals: {
      revenue: revenueNum,
      expenses: expensesNum,
      otherExpenses: otherExpensesNum,
      profit: profitNum,
    },
    currency,
  };
}

function monthsBetweenInclusive(start: Date, end: Date) {
  const months: { label: string; start: string; end: string }[] = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();

    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0);

    // clamp to requested window
    const s = startOfMonth < start ? start : startOfMonth;
    const e = endOfMonth > end ? end : endOfMonth;

    months.push({
      label: `${y}-${String(m + 1).padStart(2, "0")}`,
      start: formatLocalYMD(s),
      end: formatLocalYMD(e),
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function defaultYearToDate(now: Date) {
  const start = new Date(now.getFullYear(), 0, 1);
  const end = now; // to-date
  return { start, end };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const accounting_method =
      (url.searchParams.get("accounting_method") as "Accrual" | "Cash") ?? "Accrual";

    // Preferred: explicit start_date/end_date
    const start_date_q = url.searchParams.get("start_date") ?? "";
    const end_date_q = url.searchParams.get("end_date") ?? "";
    const startParsed = start_date_q ? parseYMD(start_date_q) : null;
    const endParsed = end_date_q ? parseYMD(end_date_q) : null;

    // Alternate: year + from_month + to_month
    const yearQ = Number(url.searchParams.get("year") ?? "");
    const fromMonthQ = Number(url.searchParams.get("from_month") ?? "");
    const toMonthQ = Number(url.searchParams.get("to_month") ?? "");

    const now = new Date();

    let rangeStart: Date;
    let rangeEnd: Date;

    if (startParsed && endParsed) {
      rangeStart = startParsed;
      rangeEnd = endParsed;
    } else if (yearQ && fromMonthQ && toMonthQ) {
      rangeStart = new Date(yearQ, fromMonthQ - 1, 1);
      rangeEnd = new Date(yearQ, toMonthQ, 0); // last day of toMonth
      // clamp end to today if future
      if (rangeEnd > now) rangeEnd = now;
    } else {
      const d = defaultYearToDate(now);
      rangeStart = d.start;
      rangeEnd = d.end;
    }

    const months = monthsBetweenInclusive(rangeStart, rangeEnd);
    const [companyInfo, monthlyTotals] = await Promise.all([
      qboFetch("companyinfo/1"),
      Promise.all(months.map((m) => fetchMonthlyPnlTotals(m.start, m.end, accounting_method))),
    ]);

    const companyName =
      companyInfo?.CompanyInfo?.CompanyName ??
      companyInfo?.CompanyInfo?.LegalName ??
      "QuickBooks Online";

    const series: Array<{
      month: string;
      revenue: number;
      expenses: number; // Expenses + OtherExpenses
      profit: number;   // Net Earnings (NetIncome)
    }> = months.map((m, idx) => {
      const totals = monthlyTotals[idx];
      return {
        month: m.label,
        revenue: totals?.totals?.revenue ?? 0,
        expenses: (totals?.totals?.expenses ?? 0) + (totals?.totals?.otherExpenses ?? 0),
        profit: totals?.totals?.profit ?? 0,
      };
    });

    const currency = monthlyTotals.find((r) => r?.currency)?.currency ?? "PKR";

    const latest = series[series.length - 1] ?? { revenue: 0, expenses: 0, profit: 0 };

    const period = series.reduce(
      (acc, x) => {
        acc.revenue += x.revenue;
        acc.expenses += x.expenses;
        acc.profit += x.profit;
        return acc;
      },
      { revenue: 0, expenses: 0, profit: 0 }
    );

    return NextResponse.json({
      ok: true,
      companyName,
      currency,
      asOf: now.toISOString(),
      accounting_method,
      range: {
        start_date: formatLocalYMD(rangeStart),
        end_date: formatLocalYMD(rangeEnd),
      },
      series,
      // keep old keys (mtd/ytd) for compatibility, but they now mean:
      // mtd = latest month in selected range, ytd = sum of selected range
      kpis: {
        mtd: latest,
        ytd: period,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
