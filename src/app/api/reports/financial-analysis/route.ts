import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { FinancialAnalysisDocument } from "@/lib/pdf/FinancialAnalysisDocument";
import { fetchFinancialReportData, rangeFromDates } from "@/lib/pdf/reportData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseYMD(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function slug(s: string): string {
  return s
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "Company";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = parseYMD(url.searchParams.get("start_date"));
    const end = parseYMD(url.searchParams.get("end_date"));
    const methodParam = url.searchParams.get("accounting_method");
    const method = methodParam === "Cash" ? "Cash" : "Accrual";

    if (!start || !end) {
      return NextResponse.json({ ok: false, error: "Missing or invalid start_date / end_date (expected YYYY-MM-DD)." }, { status: 400 });
    }
    if (start > end) {
      return NextResponse.json({ ok: false, error: "start_date must not be after end_date." }, { status: 400 });
    }

    const range = rangeFromDates(start, end, method);
    const data = await fetchFinancialReportData(url.origin, range);

    const buffer = await renderToBuffer(
      React.createElement(FinancialAnalysisDocument, { data }) as React.ReactElement<import("@react-pdf/renderer").DocumentProps>
    );

    const company = slug(data.dashboard?.companyName ?? "Company");
    const filename = `Financial-Analysis-${company}-${start}-to-${end}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
