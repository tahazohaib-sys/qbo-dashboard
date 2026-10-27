// src/app/api/forecast/route.ts
//
// History for the Financial Forecast: the P&L lines of each complete month in
// the base period, plus the bank balance at the end of that period (the
// opening cash of the forecast). The forecast itself is calculated in the
// browser (src/lib/forecast.ts), so the forecast filters update at once.
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";
import { toNum } from "@/lib/retained-earning";
import { MIN_BASE_MONTHS, addMonths, type HistoryMonth } from "@/lib/forecast";

export const dynamic = "force-dynamic";

const MAX_BASE_MONTHS = 36;

/** P&L section groups that the forecast uses. */
const GROUPS = ["Income", "COGS", "Expenses", "OtherIncome", "OtherExpenses", "NetIncome"] as const;
type Group = (typeof GROUPS)[number];

type QboCell = { value?: string };
type QboRow = { type?: string; group?: string; Summary?: { ColData?: QboCell[] }; Rows?: { Row?: QboRow[] } };

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/** Summary cells of each section group (searched in all levels of the report). */
function sectionCells(rows: { Row?: QboRow[] } | undefined, out = new Map<string, QboCell[]>()) {
  for (const r of rows?.Row ?? []) {
    if (r.type === "Section" && r.group && !out.has(r.group)) out.set(r.group, r.Summary?.ColData ?? []);
    if (r.Rows) sectionCells(r.Rows, out);
  }
  return out;
}

/** Bank balance (home currency) from the Balance Sheet on a date. null when not available. */
async function fetchBankBalance(asOf: string, method: string): Promise<number | null> {
  const rep = await qboFetch(
    `reports/BalanceSheet?start_date=${asOf}&end_date=${asOf}` +
      `&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
  );
  const cells = sectionCells(rep?.Rows).get("BankAccounts");
  return cells?.length ? toNum(cells[cells.length - 1]?.value) : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const method = url.searchParams.get("accounting_method") === "Cash" ? "Cash" : "Accrual";
    const monthsQ = Number(url.searchParams.get("months") ?? 12);
    const months = Math.min(MAX_BASE_MONTHS, Math.max(MIN_BASE_MONTHS, Number.isFinite(monthsQ) ? Math.round(monthsQ) : 12));

    // The base period ends with the last COMPLETE month: a month that is not finished
    // shows too little revenue and expense and makes the trend incorrect.
    const now = new Date();
    const currentMonth = ym(now);
    const lastComplete = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const requested = url.searchParams.get("end_month") ?? "";
    let end = /^\d{4}-\d{2}$/.test(requested) ? requested : lastComplete;
    let excludedPartialMonth: string | null = null;
    if (end >= currentMonth) {
      excludedPartialMonth = currentMonth;
      end = lastComplete;
    }
    const start = addMonths(end, -(months - 1));
    const startDate = `${start}-01`;
    const endDate = lastDayOf(end);

    const [pnl, bank] = await Promise.all([
      qboFetch(
        `reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}` +
          `&accounting_method=${method}&summarize_column_by=Month`
      ),
      fetchBankBalance(endDate, method).catch(() => null),
    ]);

    // Column index -> YYYY-MM (the "Total" column has no StartDate and is skipped)
    const cols: Array<{ MetaData?: Array<{ Name?: string; Value?: string }> }> = pnl?.Columns?.Column ?? [];
    const monthOfCol = cols.map((c) => {
      const sd = c?.MetaData?.find((x) => x?.Name === "StartDate")?.Value;
      return typeof sd === "string" && /^\d{4}-\d{2}/.test(sd) ? sd.slice(0, 7) : null;
    });

    const sections = sectionCells(pnl?.Rows);
    const byMonth = new Map<string, Record<Group, number>>();
    for (let i = 0; i < months; i++) {
      byMonth.set(addMonths(start, i), { Income: 0, COGS: 0, Expenses: 0, OtherIncome: 0, OtherExpenses: 0, NetIncome: 0 });
    }
    let hasNetIncome = false;
    for (const group of GROUPS) {
      const cells = sections.get(group);
      if (!cells) continue;
      if (group === "NetIncome") hasNetIncome = true;
      cells.forEach((cell, i) => {
        const row = monthOfCol[i] ? byMonth.get(monthOfCol[i]!) : undefined;
        if (row) row[group] += toNum(cell?.value);
      });
    }

    const history: HistoryMonth[] = Array.from(byMonth.entries()).map(([month, g]) => ({
      month,
      revenue: g.Income,
      cogs: g.COGS,
      opex: g.Expenses,
      otherIncome: g.OtherIncome,
      otherExpenses: g.OtherExpenses,
      netProfit: hasNetIncome ? g.NetIncome : g.Income - g.COGS - g.Expenses + g.OtherIncome - g.OtherExpenses,
    }));

    return NextResponse.json({
      ok: true,
      currency: pnl?.Header?.Currency ?? "PKR",
      accounting_method: method,
      period: { start, end, months },
      excludedPartialMonth,
      history,
      cash: bank != null ? { balance: bank, asOf: endDate } : null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Forecast error" }, { status: 500 });
  }
}
