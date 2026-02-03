import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function moneyToNumber(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type RowItem = {
  path: string;          // where it came from in the report
  rowType: string;       // Section / Data / Summary etc.
  label: string;         // row name
  amount: number;        // numeric value
};

function normalizeLabel(v: any) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function extractAmountFromRow(r: any): number {
  const cd =
    r?.Summary?.ColData ??
    r?.ColData ??
    r?.Header?.ColData ??
    [];

  if (!Array.isArray(cd) || cd.length === 0) return 0;

  const last = cd[cd.length - 1];
  return moneyToNumber(last?.value);
}

function flattenRows(rows: any, currentPath: string, out: RowItem[]) {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!arr || !Array.isArray(arr)) return;

  for (const r of arr) {
    const rowType = normalizeLabel(r?.type);
    const label =
      normalizeLabel(r?.Header?.ColData?.[0]?.value) ||
      normalizeLabel(r?.Summary?.ColData?.[0]?.value) ||
      normalizeLabel(r?.ColData?.[0]?.value);

    const amount = extractAmountFromRow(r);

    // Only include meaningful rows (label exists)
    if (label) {
      out.push({
        path: currentPath,
        rowType: rowType || "unknown",
        label,
        amount,
      });
    }

    // recurse children
    if (r?.Rows) {
      flattenRows(r.Rows, `${currentPath} > ${label}`, out);
    }
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // default: current month (you can change in URL)
    const start_date = searchParams.get("start_date") ?? "2026-01-01";
    const end_date = searchParams.get("end_date") ?? "2026-01-31";

    const path =
      `reports/ProfitAndLoss?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=Accrual&summarize_column_by=Total`;

    const report = await qboFetch(path);

    const out: RowItem[] = [];
    flattenRows(report?.Rows, "P&L", out);

    // clean: remove zero lines (optional) — keep if you want full detail
    const nonZero = out.filter((x) => Math.abs(x.amount) > 0);

    return NextResponse.json({
      ok: true,
      start_date,
      end_date,
      currency: report?.Header?.Currency ?? "USD",
      rows: nonZero.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      // raw: report, // uncomment if you want full JSON (very large)
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
