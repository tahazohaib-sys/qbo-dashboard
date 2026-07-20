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

// Local YYYY-MM-DD (prevents UTC shifting)
function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

type MonthCol = { label: string; start: string; end: string };

type MonthlyRow = {
  path: string;          // where it came from in the report
  rowType: string;       // Section / Data / Summary etc.
  label: string;         // row name
  monthly: number[];     // one amount per month column (aligned with `months`)
};

/**
 * Identify the month columns of a ProfitAndLoss report summarized by Month.
 * QBO returns: [ account-name column, one Money column per month (each with a
 * StartDate metadata), and usually a trailing "Total" column with no StartDate ].
 * We keep only columns that carry a StartDate so the account column and the
 * Total column are excluded.
 */
function extractMonthColumns(report: any): { indexes: number[]; months: MonthCol[] } {
  const cols: any[] = report?.Columns?.Column ?? [];
  const indexes: number[] = [];
  const months: MonthCol[] = [];

  cols.forEach((c: any, i: number) => {
    const meta: any[] = Array.isArray(c?.MetaData) ? c.MetaData : [];
    const start = meta.find((m) => m?.Name === "StartDate")?.Value;
    const end = meta.find((m) => m?.Name === "EndDate")?.Value;
    if (start) {
      indexes.push(i);
      months.push({
        label: normalizeLabel(c?.ColTitle) || String(start),
        start: String(start),
        end: String(end ?? start),
      });
    }
  });

  return { indexes, months };
}

function flattenRows(
  rows: any,
  currentPath: string,
  monthColIndexes: number[],
  out: MonthlyRow[]
) {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!arr || !Array.isArray(arr)) return;

  for (const r of arr) {
    const rowType = normalizeLabel(r?.type);
    const label =
      normalizeLabel(r?.Header?.ColData?.[0]?.value) ||
      normalizeLabel(r?.Summary?.ColData?.[0]?.value) ||
      normalizeLabel(r?.ColData?.[0]?.value);

    // Amounts for account (Data) rows live in ColData; section totals in Summary.ColData.
    const amountsRow: any[] = Array.isArray(r?.ColData)
      ? r.ColData
      : Array.isArray(r?.Summary?.ColData)
      ? r.Summary.ColData
      : [];

    const monthly = monthColIndexes.map((i) => moneyToNumber(amountsRow?.[i]?.value));

    if (label) {
      out.push({
        path: currentPath,
        rowType: rowType || "unknown",
        label,
        monthly,
      });
    }

    if (r?.Rows) {
      flattenRows(r.Rows, `${currentPath} > ${label}`, monthColIndexes, out);
    }
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const accounting_method =
      (searchParams.get("accounting_method") as "Accrual" | "Cash") ?? "Accrual";
    const months = Math.max(1, Math.min(12, Number(searchParams.get("months") ?? "6")));

    // Anchor: end_date (preferred) or year/month, else today.
    const now = new Date();
    const endParam = searchParams.get("end_date");
    const yearParam = Number(searchParams.get("year") ?? "");
    const monthParam = Number(searchParams.get("month") ?? "");

    let endDate: Date;
    if (endParam && parseYMD(endParam)) {
      endDate = parseYMD(endParam)!;
    } else if (yearParam && monthParam) {
      endDate = new Date(yearParam, monthParam, 0); // last day of that month
    } else {
      endDate = now;
    }

    const endY = endDate.getFullYear();
    const endM = endDate.getMonth() + 1; // 1-12

    // Window: first day of (endM - months + 1) .. the anchor end date.
    const windowStart = new Date(endY, endM - 1 - (months - 1), 1);
    const start_date = formatLocalYMD(windowStart);
    const end_date = formatLocalYMD(endDate);

    const path =
      `reports/ProfitAndLoss?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}` +
      `&summarize_column_by=Month`;

    const report = await qboFetch(path);

    const { indexes, months: monthCols } = extractMonthColumns(report);

    const out: MonthlyRow[] = [];
    flattenRows(report?.Rows, "P&L", indexes, out);

    return NextResponse.json({
      ok: true,
      start_date,
      end_date,
      currency: report?.Header?.Currency ?? "PKR",
      months: monthCols,
      rows: out,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
