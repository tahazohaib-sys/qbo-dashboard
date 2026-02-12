import { NextResponse } from "next/server";
import { Pool } from "pg";
import { qboFetch } from "@/lib/metrics";
import { getValidAccessToken } from "@/lib/qbo";

export const dynamic = "force-dynamic";

/**
 * Convert QBO money → integer PKR (NO decimals)
 */
function moneyInt(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * ---------- DATE HELPERS (UTC safe) ----------
 */
function parseYMD(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUTCYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthEndDatesUTC(endYmd: string, months: number): string[] {
  const end = parseYMD(endYmd);
  if (!end) return [endYmd];

  const y = end.getUTCFullYear();
  const m = end.getUTCMonth() + 1; // 1..12
  const out: string[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 0)); // day 0 => last day of previous month
    out.push(formatUTCYMD(d));
  }
  return out;
}

function monthListBetween(fromYear: number, fromMonth: number, toYear: number, toMonth: number): string[] {
  const startKey = fromYear * 100 + fromMonth;
  const endKey = toYear * 100 + toMonth;

  const sy = startKey <= endKey ? fromYear : toYear;
  const sm = startKey <= endKey ? fromMonth : toMonth;
  const ey = startKey <= endKey ? toYear : fromYear;
  const em = startKey <= endKey ? toMonth : fromMonth;

  const out: string[] = [];
  let y = sy;
  let m = sm;

  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out;
}

function monthEndFromMonthKeyUTC(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return formatUTCYMD(d);
}

function parseYearMonthParam(v: string | null): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n)) return null;
  return n;
}

function isValidYearMonthRange(fromYear: number, fromMonth: number, toYear: number, toMonth: number): boolean {
  return (
    fromYear >= 1900 &&
    toYear >= 1900 &&
    fromMonth >= 1 &&
    fromMonth <= 12 &&
    toMonth >= 1 &&
    toMonth <= 12
  );
}

function daysDiffUTC(asOf: string, base: string): number {
  const a = parseYMD(asOf);
  const b = parseYMD(base);
  if (!a || !b) return 0;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

/**
 * Fiscal year start helper (RTC uses Jul 1 → Jun 30)
 * Example: asOf=2026-01-31 => start=2025-07-01 (matches your QBO UI)
 */
function fiscalYearStartFor(asOf: string): string {
  const d = parseYMD(asOf);
  if (!d) return `${new Date().getUTCFullYear()}-07-01`;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1..12
  const fyStartYear = m >= 7 ? y : y - 1;
  return `${fyStartYear}-07-01`;
}

function normalizeAccountingMethod(input: string | null): "Accrual" | "Cash" {
  if ((input ?? "").toLowerCase() === "cash") return "Cash";
  return "Accrual";
}

/**
 * ---------- BALANCE SHEET HELPERS ----------
 */
type QboRow = {
  ColData?: Array<{ value?: string }>;
  Rows?: { Row?: QboRow[] };
};

function flattenRows(rows?: QboRow[]): QboRow[] {
  const out: QboRow[] = [];
  const stack = [...(rows ?? [])];
  while (stack.length) {
    const r = stack.shift()!;
    out.push(r);
    if (r.Rows?.Row?.length) stack.unshift(...r.Rows.Row);
  }
  return out;
}

function normLabel(s: any): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pickAccountExact(bs: any, accountName: string): number {
  const flat = flattenRows(bs?.Rows?.Row);
  const target = normLabel(accountName);
  for (const r of flat) {
    const c = r.ColData;
    if (!c || c.length < 2) continue;
    if (normLabel(c[0]?.value) === target) {
      return moneyInt(c[c.length - 1]?.value);
    }
  }
  return 0;
}

function pickAccountFuzzy(bs: any, names: string[]): number {
  const flat = flattenRows(bs?.Rows?.Row);
  const targets = names.map((n) => normLabel(n));
  for (const r of flat) {
    const c = r.ColData;
    if (!c || c.length < 2) continue;
    const label = normLabel(c[0]?.value);
    if (!label) continue;
    if (targets.some((t) => label === t || label.includes(t))) {
      return moneyInt(c[c.length - 1]?.value);
    }
  }
  return 0;
}

/**
 * ---------- LIGHT IN-MEMORY CACHE ----------
 */
type CacheItem = { exp: number; value: any };
const CACHE = new Map<string, CacheItem>();
const TTL_MS = 2 * 60 * 1000; // 2 minutes

function cacheGet<T>(key: string): T | null {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) {
    CACHE.delete(key);
    return null;
  }
  return it.value as T;
}
function cacheSet(key: string, value: any, ttl = TTL_MS) {
  CACHE.set(key, { exp: Date.now() + ttl, value });
}

/**
 * ---------- DB (Manual Adjustments) ----------
 * Using same table you already created: public.dashboard_custom_fields
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type CustomRow = {
  id: string;
  company: string;
  module: string;
  as_of: string;
  section: "payables" | "receivables";
  label: string;
  amount: number;
  notes: string | null;
  created_at: string;
};

async function fetchAdjustmentsForDates(company: string, module: string, asOfDates: string[]) {
  if (!asOfDates.length) return new Map<string, { pay: number; rec: number; rows: CustomRow[] }>();

  // Keep it safe: max 24 dates in your API anyway
  const key = `adj:${company}:${module}:${asOfDates.join("|")}`;
  const hit = cacheGet<Map<string, any>>(key);
  if (hit) return hit;

  const r = await pool.query(
    `
    SELECT id, company, module, as_of, section, label, amount, notes, created_at
    FROM public.dashboard_custom_fields
    WHERE company = $1
      AND module = $2
      AND as_of = ANY($3::date[])
    ORDER BY created_at DESC
    `,
    [company, module, asOfDates]
  );

  const map = new Map<string, { pay: number; rec: number; rows: CustomRow[] }>();
  for (const d of asOfDates) map.set(d, { pay: 0, rec: 0, rows: [] });

  for (const row of r.rows as CustomRow[]) {
    const d = String(row.as_of).slice(0, 10);
    const bucket = map.get(d) ?? { pay: 0, rec: 0, rows: [] };
    const amt = Number(row.amount ?? 0) || 0;
    if ((row.section ?? "").toLowerCase() === "payables") bucket.pay += amt;
    else bucket.rec += amt;
    bucket.rows.push({ ...row, amount: amt, as_of: d });
    map.set(d, bucket);
  }

  cacheSet(key, map);
  return map;
}

/**
 * ---------- QBO FETCHERS ----------
 */
async function fetchBalanceSheet(asOf: string, accountingMethod: "Accrual" | "Cash", companyId: string) {
  const key = `bs:${companyId}:${accountingMethod}:${asOf}`;
  const hit = cacheGet<any>(key);
  if (hit) return hit;

  const start = fiscalYearStartFor(asOf);

  // ✅ Matches your QBO UI report period behavior
  const v = await qboFetch(
    `reports/BalanceSheet?start_date=${encodeURIComponent(start)}` +
      `&end_date=${encodeURIComponent(asOf)}` +
      `&summarize_column_by=Total&accounting_method=${encodeURIComponent(accountingMethod)}`
  );

  cacheSet(key, v);
  return v;
}

async function fetchAPAgingSummary(asOf: string) {
  const key = `apaging:${asOf}`;
  const hit = cacheGet<any>(key);
  if (hit) return hit;
  const v = await qboFetch(`reports/APAgingSummary?report_date=${encodeURIComponent(asOf)}`);
  cacheSet(key, v);
  return v;
}

/**
 * ---------- AP AGING (REPORT) ----------
 */
function parseAPAgingReport(json: any) {
  const rows: QboRow[] = json?.Rows?.Row ?? [];
  const vendors: any[] = [];
  let totalAP = 0;

  for (const r of rows) {
    const c = r.ColData;
    if (!c || c.length < 2) continue;

    const name = (c[0]?.value ?? "").trim();
    if (!name) continue;

    if (name.toUpperCase() === "TOTAL") {
      totalAP = moneyInt(c[c.length - 1]?.value);
      continue;
    }

    const current = moneyInt(c[1]?.value);
    const d1_30 = moneyInt(c[2]?.value);
    const d31_60 = moneyInt(c[3]?.value);
    const d61_90 = moneyInt(c[4]?.value);
    const d91_plus = moneyInt(c[5]?.value);
    const total = moneyInt(c[c.length - 1]?.value);

    vendors.push({
      vendor: name,
      current,
      "1_30": d1_30,
      "31_60": d31_60,
      "61_90": d61_90,
      "91_plus": d91_plus,
      total,
    });

    if (!totalAP) totalAP += total;
  }

  vendors.sort((a, b) => b.total - a.total);
  return { totalAP, vendors, source: "APAgingSummary" };
}

/**
 * ---------- AP AGING FALLBACK (OPEN BILLS) ----------
 */
async function queryOpenBills() {
  const all: any[] = [];
  let start = 1;
  const size = 1000;

  while (true) {
    const q = `SELECT Id, TxnDate, DueDate, Balance, VendorRef FROM Bill WHERE Balance > '0'`;
    const path = `query?query=${encodeURIComponent(q)}` + `&startposition=${start}&maxresults=${size}`;

    const res: any = await qboFetch(path);
    const bills: any[] = res?.QueryResponse?.Bill ?? [];
    all.push(...bills);

    if (bills.length < size) break;
    start += size;
  }
  return all;
}

function buildAPAgingFromBills(asOf: string, bills: any[]) {
  const map = new Map<string, any>();

  for (const b of bills) {
    const vendor = (b?.VendorRef?.name ?? b?.VendorRef?.value ?? "Unknown Vendor").toString();
    const bal = moneyInt(b?.Balance);
    if (!bal) continue;

    const base = b?.DueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.DueDate) ? b.DueDate : b?.TxnDate;
    const days = base ? daysDiffUTC(asOf, base) : 0;

    const row =
      map.get(vendor) ??
      { vendor, current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "91_plus": 0, total: 0 };

    if (days <= 0) row.current += bal;
    else if (days <= 30) row["1_30"] += bal;
    else if (days <= 60) row["31_60"] += bal;
    else if (days <= 90) row["61_90"] += bal;
    else row["91_plus"] += bal;

    row.total += bal;
    map.set(vendor, row);
  }

  const vendors = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const totalAP = vendors.reduce((s, v) => s + v.total, 0);

  return { totalAP, vendors, source: "BillsQueryFallback" };
}

/**
 * ---------- VENDOR BILLS (MONTH-WISE, EFFICIENT) ----------
 * We want Vendor Bills outstanding at each month-end:
 *   outstanding(asOf) = sum(Bill.TotalAmt where TxnDate <= asOf) - sum(BillPayment.TotalAmt where TxnDate <= asOf)
 *
 * Efficient: fetch all bills + bill payments ONCE for the entire window, then compute cumulative per month-end.
 */
type DatedAmt = { date: string; amt: number };

async function queryDatedAmounts(entity: "Bill" | "BillPayment", endDate: string, startDate?: string): Promise<DatedAmt[]> {
  const out: DatedAmt[] = [];
  let start = 1;
  const size = 1000;

  // Use TxnDate filtering (what QBO uses for aging and most reporting)
  const lowerBound = startDate ? `TxnDate >= '${startDate}' AND ` : "";
  const q =
    entity === "Bill"
      ? `SELECT TxnDate, TotalAmt FROM Bill WHERE ${lowerBound}TxnDate <= '${endDate}'`
      : `SELECT TxnDate, TotalAmt FROM BillPayment WHERE ${lowerBound}TxnDate <= '${endDate}'`;

  while (true) {
    const path = `query?query=${encodeURIComponent(q)}` + `&startposition=${start}&maxresults=${size}`;
    const res: any = await qboFetch(path);
    const rows: any[] = res?.QueryResponse?.[entity] ?? [];

    for (const r of rows) {
      const d = String(r?.TxnDate ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      out.push({ date: d, amt: moneyInt(r?.TotalAmt) });
    }

    if (rows.length < size) break;
    start += size;
  }

  // sort asc for cumulative pointer scan
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function cumulativeSumUpto(list: DatedAmt[], upToYmd: string): number {
  // list is sorted; but we’ll do pointer scan in the builder for performance
  let sum = 0;
  for (const x of list) {
    if (x.date <= upToYmd) sum += x.amt;
    else break;
  }
  return sum;
}

async function computeVendorBillsOutstandingByMonthEnds(monthEnds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!monthEnds.length) return out;

  const end = monthEnds[monthEnds.length - 1];

  const cacheKey = `vb-months:all-history:${end}:${monthEnds.join("|")}`;
  const hit = cacheGet<Map<string, number>>(cacheKey);
  if (hit) return hit;

  const [bills, pays] = await Promise.all([queryDatedAmounts("Bill", end), queryDatedAmounts("BillPayment", end)]);

  // pointer scan (faster than recalculating for each month)
  let bi = 0;
  let pi = 0;
  let billCum = 0;
  let payCum = 0;

  for (const mEnd of monthEnds) {
    while (bi < bills.length && bills[bi].date <= mEnd) {
      billCum += bills[bi].amt;
      bi++;
    }
    while (pi < pays.length && pays[pi].date <= mEnd) {
      payCum += pays[pi].amt;
      pi++;
    }
    const outstanding = billCum - payCum;
    out.set(mEnd, outstanding > 0 ? outstanding : 0);
  }

  cacheSet(cacheKey, out, 5 * 60 * 1000); // 5 min
  return out;
}

/**
 * ---------- CORE COMPUTATION ----------
 */
type Computed = {
  asOf: string;
  payrollPayable: number;
  whtVendors: number;
  accountsPayable: number; // equals vendorBills in detailed view
  vendorBills: number; // reconstructed
  sirAatifLoanToCompany: number;
  payrollWithHoldingTaxPayable: number;

  totalPayables: number;
  loanAgainstSalary: number;
  taxWithheld: number;
  totalReceivables: number;
};

async function computeDetailedAsOf(
  asOf: string,
  accountingMethod: "Accrual" | "Cash",
  companyId: string,
  companyNameForCustom: string
): Promise<{
  computed: Computed;
  apAging: { totalAP: number; vendors: any[]; source: string };
  custom: { payablesAdj: number; receivablesAdj: number; rows: CustomRow[] };
}> {
  const bs = await fetchBalanceSheet(asOf, accountingMethod, companyId);

  const payrollPayable = pickAccountExact(bs, "Payroll Payable");
  const whtVendors = pickAccountExact(bs, "With Holding Tax Payable Vendors");
  const sirAatifLoanToCompany = pickAccountExact(bs, "Sir Aatif Loan to Company");
  const payrollWithHoldingTaxPayable = pickAccountExact(bs, "Payroll With Holding Tax Payable");

  const loanAgainstSalary = pickAccountExact(bs, "Loan Against Salary");
  const taxWithheld = pickAccountExact(bs, "Tax Withheld");

  // Accurate vendor bills (expensive) for ONLY current asOf:
  // We reuse the monthly-window method even for single date to keep one approach.
  const vbMap = await computeVendorBillsOutstandingByMonthEnds([asOf]);
  const vendorBills = vbMap.get(asOf) ?? 0;
  const accountsPayable = vendorBills;

  // Manual adjustments for current asOf
  const adjMap = await fetchAdjustmentsForDates(companyNameForCustom, "ar_ap", [asOf]);
  const adj = adjMap.get(asOf) ?? { pay: 0, rec: 0, rows: [] };

  const totalPayables =
    payrollPayable + whtVendors + accountsPayable + sirAatifLoanToCompany + payrollWithHoldingTaxPayable + adj.pay;

  const totalReceivables = loanAgainstSalary + taxWithheld + adj.rec;

  // AP Aging (as-of)
  let apAging;
  try {
    const aging = await fetchAPAgingSummary(asOf);
    apAging = parseAPAgingReport(aging);
  } catch {
    const bills = await queryOpenBills();
    apAging = buildAPAgingFromBills(asOf, bills);
  }

  return {
    computed: {
      asOf,
      payrollPayable,
      whtVendors,
      accountsPayable,
      vendorBills,
      sirAatifLoanToCompany,
      payrollWithHoldingTaxPayable,
      totalPayables,
      loanAgainstSalary,
      taxWithheld,
      totalReceivables,
    },
    apAging,
    custom: {
      payablesAdj: adj.pay,
      receivablesAdj: adj.rec,
      rows: adj.rows,
    },
  };
}

/**
 * ✅ Month-end series that matches your Payables/Receivables tables EXACTLY
 * (everything from QBO + manual adjustments)
 */
async function computeMonthEndTotalsPoint(
  companyId: string,
  companyNameForCustom: string,
  asOf: string,
  accountingMethod: "Accrual" | "Cash",
  vendorBillsOutstanding: number,
  adj: { pay: number; rec: number }
) {
  try {
    const bs = await fetchBalanceSheet(asOf, accountingMethod, companyId);

    const payrollPayable = pickAccountExact(bs, "Payroll Payable");
    const whtVendors = pickAccountExact(bs, "With Holding Tax Payable Vendors");
    const sirAatifLoanToCompany = pickAccountExact(bs, "Sir Aatif Loan to Company");
    const payrollWithHoldingTaxPayable = pickAccountExact(bs, "Payroll With Holding Tax Payable");

    const loanAgainstSalary = pickAccountExact(bs, "Loan Against Salary");
    const taxWithheld = pickAccountExact(bs, "Tax Withheld");

    const payablesTotal =
      payrollPayable +
      whtVendors +
      vendorBillsOutstanding +
      sirAatifLoanToCompany +
      payrollWithHoldingTaxPayable +
      adj.pay;

    const receivablesTotal =
      loanAgainstSalary +
      taxWithheld +
      adj.rec;

    return {
      asOf,
      payables: payablesTotal,
      receivables: receivablesTotal,
      // breakdown for debugging / future drill
      breakdown: {
        payrollPayable,
        whtVendors,
        vendorBills: vendorBillsOutstanding,
        sirAatifLoanToCompany,
        payrollWithHoldingTaxPayable,
        loanAgainstSalary,
        taxWithheld,
        manualPayablesAdj: adj.pay,
        manualReceivablesAdj: adj.rec,
      },
      error: false,
    };
  } catch {
    return { asOf, payables: 0, receivables: 0, breakdown: null as any, error: true };
  }
}

/**
 * Optional reference series: Balance Sheet A/P vs A/R only
 * (not your custom totals)
 */
async function computeMonthEndBalanceSheetArApPoint(companyId: string, asOf: string, accountingMethod: "Accrual" | "Cash") {
  try {
    const bs = await fetchBalanceSheet(asOf, accountingMethod, companyId);

    const ap = pickAccountFuzzy(bs, ["Accounts Payable (A/P)", "Accounts Payable"]) || 0;
    const ar = pickAccountFuzzy(bs, ["Accounts Receivable", "Accounts Receivable (A/R)"]) || 0;

    const debugEndPeriod =
      bs?.Header?.EndPeriod ??
      bs?.Header?.Option?.find?.((o: any) => (o?.Name ?? "").toLowerCase() === "end_date")?.Value ??
      null;

    return { asOf, payables: ap, receivables: ar, error: false, debugEndPeriod };
  } catch {
    return { asOf, payables: 0, receivables: 0, error: true, debugEndPeriod: null as any };
  }
}

/**
 * small concurrency runner
 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let idx = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return out;
}

/**
 * ---------- API ----------
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const asOf = searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
    const accountingMethod = normalizeAccountingMethod(searchParams.get("accounting_method"));
    const { realmId } = await getValidAccessToken();

    // Company name used for manual adjustments table (matches your custom-fields route default)
    const companyNameForCustom = String(searchParams.get("company") ?? "RTC League Pvt LTD").trim() || "RTC League Pvt LTD";

    // months=... controls whether monthly series is returned
    const monthsRaw = searchParams.get("months");
    const months = Math.max(1, Math.min(24, Number(monthsRaw ?? "1") || 1)); // 1..24

    // 1) Detailed current asOf (exact tables + manual adjustments)
    const { computed, apAging, custom } = await computeDetailedAsOf(asOf, accountingMethod, realmId, companyNameForCustom);

    // 2) Optional monthly series
    let monthlySeriesTotals:
      | Array<{ month: string; asOf: string; payables: number; receivables: number; error: boolean; breakdown?: any }>
      | undefined;

    let monthlySeriesBalanceSheet:
      | Array<{ month: string; asOf: string; payables: number; receivables: number; error: boolean; debugEndPeriod?: any }>
      | undefined;

    if (months > 1) {
      const fromYear = parseYearMonthParam(searchParams.get("fromYear"));
      const fromMonth = parseYearMonthParam(searchParams.get("fromMonth"));
      const toYear = parseYearMonthParam(searchParams.get("toYear"));
      const toMonth = parseYearMonthParam(searchParams.get("toMonth"));

      const hasExplicitRange =
        fromYear != null &&
        fromMonth != null &&
        toYear != null &&
        toMonth != null &&
        isValidYearMonthRange(fromYear, fromMonth, toYear, toMonth);

      const monthKeys = hasExplicitRange
        ? monthListBetween(fromYear, fromMonth, toYear, toMonth).slice(-24)
        : monthEndDatesUTC(asOf, months).map((d) => d.slice(0, 7));

      const monthEnds = monthKeys.map((mk) => monthEndFromMonthKeyUTC(mk));
      const dates = monthKeys.map((mk, i) => ({ month: mk, asOf: monthEnds[i] }));

      // Precompute vendorBills outstanding for all month-ends in ONE pass
      const vbByDate = await computeVendorBillsOutstandingByMonthEnds(monthEnds);

      // Preload all manual adjustments for those month-ends in ONE DB call
      const adjByDate = await fetchAdjustmentsForDates(companyNameForCustom, "ar_ap", monthEnds);

      // Build totals series (this is what you want to show in growth chart)
      const totals = await mapLimit(dates, 3, async (d) => {
        const vb = vbByDate.get(d.asOf) ?? 0;
        const a = adjByDate.get(d.asOf) ?? { pay: 0, rec: 0, rows: [] };
        const point = await computeMonthEndTotalsPoint(realmId, companyNameForCustom, d.asOf, accountingMethod, vb, {
          pay: a.pay,
          rec: a.rec,
        });
        return { month: d.month, asOf: d.asOf, payables: point.payables, receivables: point.receivables, error: point.error, breakdown: point.breakdown };
      });

      monthlySeriesTotals = totals;

      // Optional: reference A/P vs A/R series
      const bsSeries = await mapLimit(dates, 3, async (d) => {
        const p = await computeMonthEndBalanceSheetArApPoint(realmId, d.asOf, accountingMethod);
        return { month: d.month, asOf: d.asOf, payables: p.payables, receivables: p.receivables, error: p.error, debugEndPeriod: p.debugEndPeriod };
      });

      monthlySeriesBalanceSheet = bsSeries;
    }

    return NextResponse.json({
      ok: true,
      asOf,
      currency: "PKR",

      // ✅ These are your exact tables/cards numbers (QBO + manual adjustments)
      payables: {
        current: {
          payrollPayable: computed.payrollPayable,
          withHoldingTaxPayableVendors: computed.whtVendors,
          accountsPayable: computed.accountsPayable, // equals vendorBills here
          vendorBills: computed.vendorBills,
          totalCurrentPayables: computed.payrollPayable + computed.whtVendors + computed.accountsPayable + custom.payablesAdj,
        },
        longTerm: {
          sirAatifLoanToCompany: computed.sirAatifLoanToCompany,
          payrollWithHoldingTaxPayable: computed.payrollWithHoldingTaxPayable,
          totalLongTermPayables: computed.sirAatifLoanToCompany + computed.payrollWithHoldingTaxPayable,
        },
        manualAdjustments: custom.payablesAdj,
        totalPayables: computed.totalPayables,
      },

      receivables: {
        loanAgainstSalary: computed.loanAgainstSalary,
        taxWithheld: computed.taxWithheld,
        manualAdjustments: custom.receivablesAdj,
        totalReceivables: computed.totalReceivables,
      },

      // Keep your existing AP Aging
      apAging,

      // Return raw custom rows too (useful for UI)
      customFields: {
        company: companyNameForCustom,
        module: "ar_ap",
        asOf,
        rows: custom.rows,
      },

      // ✅ Use this for the Growth chart (matches your tables exactly)
      // Keep legacy key for dashboard compatibility.
      monthlySeries: monthlySeriesTotals,
      monthlySeriesTotals,

      // Optional reference series (true Balance Sheet A/P vs A/R)
      monthlySeriesBalanceSheet,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
