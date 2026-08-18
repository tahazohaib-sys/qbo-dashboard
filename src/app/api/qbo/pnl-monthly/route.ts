// Month-by-month Profit & Loss breakdown (summarize_column_by=Month), used by
// the Financial Analysis report to show every income/expense category's
// trend across the selected period instead of just a period total.
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function moneyToNumber(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLabel(v: any) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

type ColMeta = { idx: number; title: string; monthKey: string | null };

function getColumns(report: any): ColMeta[] {
  const cols = report?.Columns?.Column;
  if (!Array.isArray(cols)) return [];
  return cols.map((c: any, idx: number) => {
    const title = normalizeLabel(c?.ColTitle);
    const meta = Array.isArray(c?.MetaData) ? c.MetaData : [];
    const startDate = meta.find((m: any) => m?.Name === "StartDate")?.Value;
    const monthKey = typeof startDate === "string" && /^\d{4}-\d{2}/.test(startDate) ? startDate.slice(0, 7) : null;
    return { idx, title, monthKey };
  });
}

export type MonthlyRow = { path: string; rowType: string; label: string; monthly: number[]; total: number };

function rowColData(r: any): any[] {
  return r?.Summary?.ColData ?? r?.ColData ?? r?.Header?.ColData ?? [];
}

function flattenMonthly(rows: any, currentPath: string, monthCols: ColMeta[], totalIdx: number, out: MonthlyRow[]) {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!arr || !Array.isArray(arr)) return;

  for (const r of arr) {
    const rowType = normalizeLabel(r?.type);
    const label =
      normalizeLabel(r?.Header?.ColData?.[0]?.value) ||
      normalizeLabel(r?.Summary?.ColData?.[0]?.value) ||
      normalizeLabel(r?.ColData?.[0]?.value);

    if (label) {
      const cd = rowColData(r);
      out.push({
        path: currentPath,
        rowType: rowType || "unknown",
        label,
        monthly: monthCols.map((c) => moneyToNumber(cd[c.idx]?.value)),
        total: moneyToNumber(cd[totalIdx]?.value ?? cd[cd.length - 1]?.value),
      });
    }

    if (r?.Rows) {
      flattenMonthly(r.Rows, `${currentPath} > ${label}`, monthCols, totalIdx, out);
    }
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start_date = searchParams.get("start_date") ?? "";
    const end_date = searchParams.get("end_date") ?? "";
    const accounting_method = (searchParams.get("accounting_method") ?? "Accrual") as "Accrual" | "Cash";

    if (!start_date || !end_date) {
      return NextResponse.json({ ok: false, error: "Missing start_date or end_date" }, { status: 400 });
    }

    const path =
      `reports/ProfitAndLoss?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}&summarize_column_by=Month`;

    const report = await qboFetch(path);

    const columns = getColumns(report);
    const monthCols = columns.filter((c) => c.monthKey);
    const totalCol = columns.find((c) => c.title.toLowerCase() === "total");
    const totalIdx = totalCol ? totalCol.idx : columns.length - 1;

    const out: MonthlyRow[] = [];
    flattenMonthly(report?.Rows, "P&L", monthCols, totalIdx, out);

    const nonZero = out.filter((x) => x.monthly.some((v) => v !== 0) || x.total !== 0);

    return NextResponse.json({
      ok: true,
      start_date,
      end_date,
      currency: report?.Header?.Currency ?? "USD",
      months: monthCols.map((c) => c.monthKey),
      rows: nonZero,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
