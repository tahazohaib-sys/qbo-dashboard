import { NextRequest, NextResponse } from "next/server";
import { analyzeFinancials } from "@/lib/reports/financial-analysis/analysis";
import { buildFinancialAnalysisPdf } from "@/lib/reports/financial-analysis/pdf";

export const dynamic = "force-dynamic";

type AccountingMethod = "Accrual" | "Cash";

function normalizeMethod(input: unknown): AccountingMethod {
  return String(input).toLowerCase() === "cash" ? "Cash" : "Accrual";
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthSpanInclusive(startDate: string, endDate: string): number {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm) + 1;
  return Math.min(24, Math.max(months, 1));
}

function originFrom(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const json = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || (json && (json as any).ok === false)) {
    const err = (json as any)?.error ?? `Failed request: ${url}`;
    throw new Error(err);
  }
  return json;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const startDate = String(body?.start_date ?? "");
    const endDate = String(body?.end_date ?? "");
    const accountingMethod = normalizeMethod(body?.accounting_method);
    const forecastHorizon = body?.forecast_horizon === 12 ? 12 : 6;

    if (!isYmd(startDate) || !isYmd(endDate)) {
      return NextResponse.json({ ok: false, error: "start_date and end_date must be YYYY-MM-DD" }, { status: 400 });
    }

    const origin = originFrom(req);

    const dashboard = await fetchJson<any>(
      `${origin}/api/dashboard?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&accounting_method=${encodeURIComponent(accountingMethod)}`
    );

    const series = Array.isArray(dashboard?.series) ? dashboard.series : [];

    const [pnlTable, retained, arAp, manualAdjustments, forecast] = await Promise.all([
      fetchJson<any>(
        `${origin}/api/qbo/pnl-table?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&accounting_method=${encodeURIComponent(accountingMethod)}`
      ),
      fetchJson<any>(
        `${origin}/api/qbo/retained-earning?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&accounting_method=${encodeURIComponent(accountingMethod)}`
      ),
      fetchJson<any>(
        `${origin}/api/qbo/ar-ap?asOf=${encodeURIComponent(endDate)}&months=${monthSpanInclusive(startDate, endDate)}&accounting_method=${encodeURIComponent(accountingMethod)}`
      ),
      fetchJson<any>(`${origin}/api/custom-fields/ar-ap?asOf=${encodeURIComponent(endDate)}`).catch(() => ({ ok: true, rows: [] })),
      fetchJson<any>(`${origin}/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series, horizon: forecastHorizon }),
      }).catch(() => ({ ok: true, horizon: forecastHorizon, averages: {}, benchmarks: {}, trends: {}, forecast: [] })),
    ]);

    const analysis = analyzeFinancials(series, pnlTable?.rows ?? []);

    const pdfBytes = buildFinancialAnalysisPdf({
      companyName: dashboard?.companyName ?? "QuickBooks Company",
      currency: dashboard?.currency ?? "PKR",
      startDate,
      endDate,
      accountingMethod,
      generatedAtIso: new Date().toISOString(),
      series,
      analysis,
      retained,
      forecast,
      arAp,
      manualAdjustments: manualAdjustments?.rows ?? [],
    });

    const filename = `financial-analysis-${startDate}-to-${endDate}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Failed to generate financial analysis report",
      },
      { status: 500 }
    );
  }
}
