import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function flattenRows(rows: any, path: string[] = [], out: any[] = []) {
  if (!rows?.Row) return out;
  for (const r of rows.Row) {
    if (r.type === "Section") {
      const label = r.Header?.ColData?.[0]?.value;
      flattenRows(r.Rows, [...path, label].filter(Boolean), out);
    } else if (r.type === "Data") {
      out.push({
        path: path.join(" > "),
        label: r.ColData?.[0]?.value,
        col1: r.ColData?.[1]?.value ?? null,
      });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get("as_of_date");
  const method = searchParams.get("accounting_method") ?? "Accrual";

  if (!asOf) {
    return NextResponse.json({ ok: false, error: "Missing as_of_date" }, { status: 400 });
  }

  const rep = await qboFetch(
    `reports/BalanceSheet?start_date=${encodeURIComponent(asOf)}&end_date=${encodeURIComponent(
      asOf
    )}&accounting_method=${encodeURIComponent(method)}&summarize_column_by=Total`
  );

  const rows = flattenRows(rep?.Rows);
  return NextResponse.json({
    ok: true,
    as_of_date: asOf,
    accounting_method: method,
    rows,
  });
}
