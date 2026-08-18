// Server-side data aggregator for the Financial Analysis PDF report.
// Re-fetches every dashboard module for the requested period (rather than
// relying on whatever the browser has already loaded) so the report is
// complete regardless of which tabs the user has visited.

export type DashboardResp = {
  ok: boolean;
  companyName: string;
  currency: string;
  asOf: string;
  accounting_method: "Accrual" | "Cash";
  range: { start_date: string; end_date: string };
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  kpis: {
    mtd: { revenue: number; expenses: number; profit: number };
    ytd: { revenue: number; expenses: number; profit: number };
  };
  error?: string;
};

export type PnlRow = { path: string; rowType: string; label: string; amount: number };
export type PnlTableResp = { ok: boolean; rows: PnlRow[]; currency: string; error?: string };

export type CashBankAccount = {
  id: string;
  name: string;
  accountType: string;
  accountSubType?: string;
  currency: string;
  currentBalance: number;
};
export type CashBanksResp = {
  ok: boolean;
  count: number;
  accounts: CashBankAccount[];
  totalsByCurrency: Record<string, number>;
  error?: string;
};

export type ArApResp = {
  ok: boolean;
  asOf: string;
  currency: string;
  payables: {
    current: {
      payrollPayable: number;
      withHoldingTaxPayableVendors: number;
      accountsPayable: number;
      vendorBills?: number;
      totalCurrentPayables: number;
    };
    longTerm: {
      sirAatifLoanToCompany: number;
      payrollWithHoldingTaxPayable: number;
      totalLongTermPayables: number;
    };
    totalPayables: number;
  };
  receivables: { loanAgainstSalary: number; taxWithheld: number; totalReceivables: number };
  apAging: {
    totalAP: number;
    vendors: Array<{
      vendor: string;
      current: number;
      "1_30": number;
      "31_60": number;
      "61_90": number;
      "91_plus": number;
      total: number;
    }>;
    source: string;
  };
  monthlySeries?: Array<{ month: string; asOf: string; payables: number; receivables: number; error: boolean }>;
  error?: string;
};

export type RetainedResp = {
  ok: boolean;
  currency: string;
  netProfit?: number;
  longTermAssetsMovement?: number;
  longTermAssets?: {
    end: number;
    prior: number;
    detail?: Array<{ label: string; end: number; prior: number; movement: number }>;
  };
  investments?: {
    items?: Array<{ label: string; amount: number; type: "investment" | "contribution" }>;
    contribution: number;
    totalInvestments: number;
    netInvestments: number;
  };
  retainedEarning?: number;
  charts?: {
    investmentBars: Array<{ name: string; value: number }>;
    retainedDonut: Array<{ name: string; value: number }>;
  };
  error?: string;
};

export type ForecastApiResp = {
  ok: boolean;
  horizon: number;
  meta?: { monthsUsed: number; lastMonth?: string; currentCash?: number };
  trends?: { revenueMoM: number; expensesMoM: number; expenseRatio?: number | null };
  averages?: { avgMonthlyRevenue: number; avgMonthlyOpex: number; avgMonthlyProfit: number; avgNetMarginPct?: number };
  benchmarks?: { breakevenRevenue: number; margin10: number; margin20: number; margin30: number; monthsToBreakeven?: number | null };
  summary?: {
    nextMonthRevenue: number;
    nextMonthOpex: number;
    nextMonthProfit: number;
    endRevenue: number;
    endOpex: number;
    endProfit: number;
    cumulativeProfit: number;
    runwayMonths: number | null;
  };
  forecast?: Array<{ month: string; revenue: number; opex: number; profit: number; profitMarginPct?: number; cumulativeProfit?: number }>;
  scenarios?: {
    pessimistic: Array<{ month: string; revenue: number; opex: number; profit: number; profitMarginPct: number }>;
    base: Array<{ month: string; revenue: number; opex: number; profit: number; profitMarginPct: number }>;
    optimistic: Array<{ month: string; revenue: number; opex: number; profit: number; profitMarginPct: number }>;
    summary?: {
      pessimistic: { endRevenue: number; endOpex: number; endProfit: number; totalProfit: number; endMarginPct: number };
      base: { endRevenue: number; endOpex: number; endProfit: number; totalProfit: number; endMarginPct: number };
      optimistic: { endRevenue: number; endOpex: number; endProfit: number; totalProfit: number; endMarginPct: number };
    };
  };
  error?: string;
};

export type InsightsResp = {
  ok: boolean;
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  error?: string;
};

export type ReportRange = {
  start: string;
  end: string;
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  method: "Accrual" | "Cash";
};

export type FinancialReportData = {
  range: ReportRange;
  generatedAt: string;
  dashboard: DashboardResp | null;
  pnlBreakdown: Array<{ name: string; value: number }>;
  cashBanks: CashBanksResp | null;
  arAp: ArApResp | null;
  retained: RetainedResp | null;
  forecast: ForecastApiResp | null;
  insights: InsightsResp | null;
  warnings: string[];
};

export function monthSpanInclusive(fy: number, fm: number, ty: number, tm: number): number {
  const span = (ty - fy) * 12 + (tm - fm) + 1;
  return Math.max(1, Math.min(24, span));
}

export function rangeFromDates(startYmd: string, endYmd: string, method: "Accrual" | "Cash"): ReportRange {
  const [fy, fm] = startYmd.split("-").map(Number);
  const [ty, tm] = endYmd.split("-").map(Number);
  return { start: startYmd, end: endYmd, fromYear: fy, fromMonth: fm, toYear: ty, toMonth: tm, method };
}

async function safeFetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok || json?.ok === false) {
      return { ok: false, data: null, error: json?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, data: null, error: message };
  }
}

function buildPnlBreakdown(rows: PnlRow[]): Array<{ name: string; value: number }> {
  const expenseRows = rows.filter((r) => {
    if (r.rowType !== "Data") return false;
    const p = r.path || "";
    return p.startsWith("P&L > Expenses") || p.startsWith("P&L > Other Expenses");
  });
  const map = new Map<string, number>();
  for (const r of expenseRows) map.set(r.label, (map.get(r.label) ?? 0) + (r.amount ?? 0));
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value);
}

export async function fetchFinancialReportData(origin: string, range: ReportRange): Promise<FinancialReportData> {
  const { start, end, fromYear, fromMonth, toYear, toMonth, method } = range;
  const warnings: string[] = [];

  const dashboardUrl = `${origin}/api/dashboard?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}`;
  const pnlUrl = `${origin}/api/qbo/pnl-table?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}`;
  const cashUrl = `${origin}/api/qbo/cash-banks?includeZero=true`;
  const retainedUrl = `${origin}/api/qbo/retained-earning?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}`;
  const insightsUrl = `${origin}/api/ai/insights?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(method)}`;

  const months = monthSpanInclusive(fromYear, fromMonth, toYear, toMonth);
  const arApUrl =
    `${origin}/api/qbo/ar-ap?asOf=${encodeURIComponent(end)}&months=${months}` +
    `&fromYear=${fromYear}&fromMonth=${fromMonth}&toYear=${toYear}&toMonth=${toMonth}` +
    `&accounting_method=${encodeURIComponent(method)}`;

  const [dashRes, pnlRes, cashRes, arApRes, retainedRes, insightsRes] = await Promise.all([
    safeFetchJson<DashboardResp>(dashboardUrl),
    safeFetchJson<PnlTableResp>(pnlUrl),
    safeFetchJson<CashBanksResp>(cashUrl),
    safeFetchJson<ArApResp>(arApUrl),
    safeFetchJson<RetainedResp>(retainedUrl),
    safeFetchJson<InsightsResp>(insightsUrl),
  ]);

  if (!dashRes.ok) warnings.push(`Profit & Loss data could not be loaded (${dashRes.error ?? "unknown error"}).`);
  if (!pnlRes.ok) warnings.push(`Expense breakdown could not be loaded (${pnlRes.error ?? "unknown error"}).`);
  if (!cashRes.ok) warnings.push(`Bank & cash balances could not be loaded (${cashRes.error ?? "unknown error"}).`);
  if (!arApRes.ok) warnings.push(`Accounts receivable/payable data could not be loaded (${arApRes.error ?? "unknown error"}).`);
  if (!retainedRes.ok) warnings.push(`Retained earnings data could not be loaded (${retainedRes.error ?? "unknown error"}).`);
  if (!insightsRes.ok) warnings.push(`Executive commentary could not be generated (${insightsRes.error ?? "unknown error"}).`);

  let forecast: ForecastApiResp | null = null;
  if (dashRes.data?.series?.length) {
    const currentCash = cashRes.data?.ok ? cashRes.data.totalsByCurrency?.["PKR"] ?? undefined : undefined;
    const forecastRes = await safeFetchJson<ForecastApiResp>(`${origin}/api/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series: dashRes.data.series, horizon: 6, ...(currentCash != null ? { currentCash } : {}) }),
    });
    if (forecastRes.ok) forecast = forecastRes.data;
    else warnings.push(`Forecast could not be generated (${forecastRes.error ?? "unknown error"}).`);
  } else {
    warnings.push("Forecast skipped — no monthly Profit & Loss series available for the selected period.");
  }

  return {
    range,
    generatedAt: new Date().toISOString(),
    dashboard: dashRes.data,
    pnlBreakdown: pnlRes.data ? buildPnlBreakdown(pnlRes.data.rows) : [],
    cashBanks: cashRes.data,
    arAp: arApRes.data,
    retained: retainedRes.data,
    forecast,
    insights: insightsRes.data,
    warnings,
  };
}
