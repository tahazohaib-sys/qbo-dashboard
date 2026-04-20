// src/app/api/qbo/ar-ap/route.ts
import { NextResponse } from "next/server";
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
  const m = end.getUTCMonth() + 1; // 1..12 from asOf month
  const out: string[] = [];

  // Generate month-ends ending at (y,m)
  for (let i = months - 1; i >= 0; i--) {
    // month-end of (m - i)
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

function pickAccount(bs: any, accountName: string): number {
  const flat = flattenRows(bs?.Rows?.Row);
  for (const r of flat) {
    const c = r.ColData;
    if (!c || c.length < 2) continue;
    if ((c[0]?.value ?? "").trim() === accountName) {
      return moneyInt(c[1]?.value);
    }
  }
  return 0;
}

type RowAmount = { label: string; path: string; amount: number };

function collectBalanceSheetAmounts(rows: QboRow[] | undefined, path: string[] = [], out: RowAmount[] = []): RowAmount[] {
  for (const r of rows ?? []) {
    const header = (r as any)?.Header?.ColData?.[0]?.value?.trim?.() ?? "";
    const summary = (r as any)?.Summary?.ColData;

    if (summary?.length) {
      const summaryLabel = (summary[0]?.value ?? "").trim() || (header ? `Total ${header}` : "");
      if (summaryLabel) {
        out.push({
          label: summaryLabel,
          path: [...path, header].filter(Boolean).join(" > "),
          amount: moneyInt(summary[summary.length - 1]?.value),
        });
      }
    }

    const colData = r.ColData;
    if (colData?.length && colData[0]?.value) {
      out.push({
        label: (colData[0]?.value ?? "").trim(),
        path: path.join(" > "),
        amount: moneyInt(colData[colData.length - 1]?.value),
      });
    }

    if (r.Rows?.Row?.length) {
      collectBalanceSheetAmounts(r.Rows.Row, [...path, header].filter(Boolean), out);
    }
  }

  return out;
}

function pickBalanceSheetTotal(entries: RowAmount[], keyword: "accounts receivable" | "accounts payable"): number {
  const fallbackRegex = keyword === "accounts receivable" ? /(accounts receivable|a\/r)/i : /(accounts payable|a\/p)/i;

  const scored = entries
    .filter((e) => {
      const label = e.label.toLowerCase();
      const path = e.path.toLowerCase();
      return label.includes(keyword) || path.includes(keyword) || fallbackRegex.test(e.label) || fallbackRegex.test(e.path);
    })
    .map((e) => {
      const label = e.label.toLowerCase();
      const path = e.path.toLowerCase();
      let score = 0;
      if (label.includes(`total ${keyword}`)) score += 5;
      if (label === keyword) score += 4;
      if (label.includes(keyword)) score += 3;
      if (fallbackRegex.test(e.label)) score += 2;
      if (path.includes(keyword) || fallbackRegex.test(e.path)) score += 1;
      return { ...e, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length ? moneyInt(scored[0].amount) : 0;
}

function extractArApFromBalanceSheet(bs: any): { receivables: number; payables: number } {
  const entries = collectBalanceSheetAmounts(bs?.Rows?.Row);
  const receivables = pickBalanceSheetTotal(entries, "accounts receivable");
  const payables = pickBalanceSheetTotal(entries, "accounts payable");
  return { receivables, payables };
}

function normalizeAccountingMethod(input: string | null): "Accrual" | "Cash" {
  if ((input ?? "").toLowerCase() === "cash") return "Cash";
  return "Accrual";
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
 * ---------- FETCHERS ----------
 */
async function fetchBalanceSheet(asOf: string, accountingMethod: "Accrual" | "Cash", companyId: string) {
  const key = `bs:${companyId}:${accountingMethod}:${asOf}`;
  const hit = cacheGet<any>(key);
  if (hit) return hit;
  try {
    const v = await qboFetch(
      `reports/BalanceSheet?as_of_date=${encodeURIComponent(asOf)}` +
        `&accounting_method=${encodeURIComponent(accountingMethod)}`
    );
    cacheSet(key, v);
    return v;
  } catch {
    // Fallback form: some QBO tenants are stricter with date-style params on reports.
    const v = await qboFetch(
      `reports/BalanceSheet?start_date=${encodeURIComponent(asOf)}&end_date=${encodeURIComponent(asOf)}` +
        `&summarize_column_by=Total&accounting_method=${encodeURIComponent(accountingMethod)}`
    );
    cacheSet(key, v);
    return v;
  }
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
 * ---------- TRUE MONTH-END VENDOR BILLS (RECONSTRUCT) ----------
 * Vendor Bills as-of date:
 *   sum(Bill.TotalAmt up to asOf) - sum(BillPayment.TotalAmt up to asOf)
 * NOTE: Accurate but expensive. We use it ONLY for the main asOf.
 */
async function sumBillsTotalAmtUpto(asOf: string): Promise<number> {
  const q = `SELECT TotalAmt FROM Bill WHERE TxnDate <= '${asOf}'`;
  let start = 1;
  const size = 1000;
  let total = 0;

  while (true) {
    const path = `query?query=${encodeURIComponent(q)}` + `&startposition=${start}&maxresults=${size}`;

    const res: any = await qboFetch(path);
    const rows: any[] = res?.QueryResponse?.Bill ?? [];
    for (const r of rows) total += moneyInt(r?.TotalAmt);

    if (rows.length < size) break;
    start += size;
  }

  return total;
}

async function sumBillPaymentsTotalAmtUpto(asOf: string): Promise<number> {
  const q = `SELECT TotalAmt FROM BillPayment WHERE TxnDate <= '${asOf}'`;
  let start = 1;
  const size = 1000;
  let total = 0;

  while (true) {
    const path = `query?query=${encodeURIComponent(q)}` + `&startposition=${start}&maxresults=${size}`;

    const res: any = await qboFetch(path);
    const rows: any[] = res?.QueryResponse?.BillPayment ?? [];
    for (const r of rows) total += moneyInt(r?.TotalAmt);

    if (rows.length < size) break;
    start += size;
  }

  return total;
}

async function computeVendorBillsAsOf(asOf: string): Promise<number> {
  const cacheKey = `vendorBills:${asOf}`;
  const hit = cacheGet<number>(cacheKey);
  if (typeof hit === "number") return hit;

  const [bills, payments] = await Promise.all([sumBillsTotalAmtUpto(asOf), sumBillPaymentsTotalAmtUpto(asOf)]);
  const outstanding = bills - payments;
  const v = outstanding > 0 ? outstanding : 0;

  cacheSet(cacheKey, v, 5 * 60 * 1000); // 5 min
  return v;
}

/**
 * ---------- CORE COMPUTATION ----------
 */
type Computed = {
  asOf: string;
  payrollPayable: number;
  whtVendors: number;
  accountsPayable: number; // in detailed view this is vendorBills (reconstructed)
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
  companyId: string
): Promise<{
  computed: Computed;
  apAging: { totalAP: number; vendors: any[]; source: string };
}> {
  // ===== BALANCE SHEET ACCOUNTS =====
  const PAYROLL_PAYABLE = "Payroll Payable";
  const WHT_VENDOR = "With Holding Tax Payable Vendors";

  const AATIF_LOAN = "Sir Aatif Loan to Company";
  const PAYROLL_WHT = "Payroll With Holding Tax Payable";

  const LOAN_SALARY = "Loan Against Salary";
  const TAX_WITHHELD = "Tax Withheld";

  const bs = await fetchBalanceSheet(asOf, accountingMethod, companyId);

  const payrollPayable = pickAccount(bs, PAYROLL_PAYABLE);
  const whtVendors = pickAccount(bs, WHT_VENDOR);

  // Accurate month-end vendor bills (expensive)
  const vendorBills = await computeVendorBillsAsOf(asOf);
  const accountsPayable = vendorBills;

  const sirAatifLoanToCompany = pickAccount(bs, AATIF_LOAN);
  const payrollWithHoldingTaxPayable = pickAccount(bs, PAYROLL_WHT);

  const totalPayables = payrollPayable + whtVendors + accountsPayable + sirAatifLoanToCompany + payrollWithHoldingTaxPayable;

  const loanAgainstSalary = pickAccount(bs, LOAN_SALARY);
  const taxWithheld = pickAccount(bs, TAX_WITHHELD);
  const totalReceivables = loanAgainstSalary + taxWithheld;

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
  };
}

/**
 * FAST monthly totals for chart:
 * Pick the same named accounts as computeDetailedAsOf but from the Balance Sheet only
 * (no expensive bill reconstruction — uses QBO's "Accounts Payable" line as vendor bills proxy).
 */
async function computeMonthEndArApPoint(companyId: string, asOf: string, accountingMethod: "Accrual" | "Cash") {
  try {
    const bs = await fetchBalanceSheet(asOf, accountingMethod, companyId);

    const payrollPayable = pickAccount(bs, "Payroll Payable");
    const whtVendors = pickAccount(bs, "With Holding Tax Payable Vendors");
    const accountsPayable = pickAccount(bs, "Accounts Payable"); // QBO AP account = vendor bills at month-end
    const sirAatifLoan = pickAccount(bs, "Sir Aatif Loan to Company");
    const payrollWHT = pickAccount(bs, "Payroll With Holding Tax Payable");
    const totalPayables = payrollPayable + whtVendors + accountsPayable + sirAatifLoan + payrollWHT;

    const loanAgainstSalary = pickAccount(bs, "Loan Against Salary");
    const taxWithheld = pickAccount(bs, "Tax Withheld");
    const totalReceivables = loanAgainstSalary + taxWithheld;

    return { asOf, payables: totalPayables, receivables: totalReceivables, error: false };
  } catch {
    return { asOf, payables: 0, receivables: 0, error: true };
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

    // months=... controls whether monthlySeries is returned
    const monthsRaw = searchParams.get("months");
    const months = Math.max(1, Math.min(24, Number(monthsRaw ?? "1") || 1)); // 1..24

    // 1) Detailed current asOf (accurate)
    const { computed, apAging } = await computeDetailedAsOf(asOf, accountingMethod, realmId);

    // 2) Optional monthly series (FAST totals)
    let monthlySeries: Array<{ month: string; asOf: string; payables: number; receivables: number; error: boolean }> | undefined;

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

      const dates = monthKeys.map((mk) => ({ month: mk, asOf: monthEndFromMonthKeyUTC(mk) }));

      // Concurrency 3 to avoid QBO throttling
      const series = await mapLimit(dates, 3, async (d) => {
        const point = await computeMonthEndArApPoint(realmId, d.asOf, accountingMethod);
        return {
          month: d.month,
          asOf: d.asOf,
          payables: point.payables,
          receivables: point.receivables,
          error: point.error,
        };
      });

      monthlySeries = series;
    }

    return NextResponse.json({
      ok: true,
      asOf,
      currency: "PKR",

      payables: {
        current: {
          payrollPayable: computed.payrollPayable,
          withHoldingTaxPayableVendors: computed.whtVendors,
          accountsPayable: computed.accountsPayable, // equals vendorBills here
          vendorBills: computed.vendorBills,
          totalCurrentPayables: computed.payrollPayable + computed.whtVendors + computed.accountsPayable,
        },
        longTerm: {
          sirAatifLoanToCompany: computed.sirAatifLoanToCompany,
          payrollWithHoldingTaxPayable: computed.payrollWithHoldingTaxPayable,
          totalLongTermPayables: computed.sirAatifLoanToCompany + computed.payrollWithHoldingTaxPayable,
        },
        totalPayables: computed.totalPayables,
      },

      receivables: {
        loanAgainstSalary: computed.loanAgainstSalary,
        taxWithheld: computed.taxWithheld,
        totalReceivables: computed.totalReceivables,
      },

      apAging,

      monthlySeries,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
