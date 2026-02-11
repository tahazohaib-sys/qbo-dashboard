// src/app/api/qbo/ar-ap/route.ts
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

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
    const d = new Date(Date.UTC(y, (m - i), 0)); // day 0 => last day of previous month => month-end
    out.push(formatUTCYMD(d));
  }
  return out;
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

/**
 * ---------- LIGHT IN-MEMORY CACHE (reduces repeated QBO hits) ----------
 * Good enough for dev/prod single instance. If you scale, move to Supabase snapshots later.
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
async function fetchBalanceSheet(asOf: string) {
  const key = `bs:${asOf}`;
  const hit = cacheGet<any>(key);
  if (hit) return hit;
  const v = await qboFetch(`reports/BalanceSheet?as_of_date=${encodeURIComponent(asOf)}`);
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
    const path =
      `query?query=${encodeURIComponent(q)}` +
      `&startposition=${start}&maxresults=${size}`;

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
    const vendor =
      (b?.VendorRef?.name ?? b?.VendorRef?.value ?? "Unknown Vendor").toString();

    const bal = moneyInt(b?.Balance);
    if (!bal) continue;

    const base =
      b?.DueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.DueDate)
        ? b.DueDate
        : b?.TxnDate;

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
 * NOTE: This is accurate but expensive. We will use it ONLY for the main asOf.
 */
async function sumBillsTotalAmtUpto(asOf: string): Promise<number> {
  const q = `SELECT TotalAmt FROM Bill WHERE TxnDate <= '${asOf}'`;
  let start = 1;
  const size = 1000;
  let total = 0;

  while (true) {
    const path =
      `query?query=${encodeURIComponent(q)}` +
      `&startposition=${start}&maxresults=${size}`;

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
    const path =
      `query?query=${encodeURIComponent(q)}` +
      `&startposition=${start}&maxresults=${size}`;

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

  const [bills, payments] = await Promise.all([
    sumBillsTotalAmtUpto(asOf),
    sumBillPaymentsTotalAmtUpto(asOf),
  ]);
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
  vendorBills: number;     // reconstructed
  sirAatifLoanToCompany: number;
  payrollWithHoldingTaxPayable: number;

  totalPayables: number;
  loanAgainstSalary: number;
  taxWithheld: number;
  totalReceivables: number;
};

async function computeDetailedAsOf(asOf: string): Promise<{
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

  const bs = await fetchBalanceSheet(asOf);

  const payrollPayable = pickAccount(bs, PAYROLL_PAYABLE);
  const whtVendors = pickAccount(bs, WHT_VENDOR);

  // Accurate month-end vendor bills (expensive)
  const vendorBills = await computeVendorBillsAsOf(asOf);
  const accountsPayable = vendorBills;

  const sirAatifLoanToCompany = pickAccount(bs, AATIF_LOAN);
  const payrollWithHoldingTaxPayable = pickAccount(bs, PAYROLL_WHT);

  const totalPayables =
    payrollPayable +
    whtVendors +
    accountsPayable +
    sirAatifLoanToCompany +
    payrollWithHoldingTaxPayable;

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
 * Use BalanceSheet "Accounts Payable (A/P)" as proxy for vendor bills month-end
 * (avoids scanning all bills/payments).
 */
async function computeFastTotals(asOf: string): Promise<{ asOf: string; totalPayables: number; totalReceivables: number }> {
  const PAYROLL_PAYABLE = "Payroll Payable";
  const WHT_VENDOR = "With Holding Tax Payable Vendors";
  const AP = "Accounts Payable (A/P)"; // fast month-end A/P from BalanceSheet

  const AATIF_LOAN = "Sir Aatif Loan to Company";
  const PAYROLL_WHT = "Payroll With Holding Tax Payable";

  const LOAN_SALARY = "Loan Against Salary";
  const TAX_WITHHELD = "Tax Withheld";

  const bs = await fetchBalanceSheet(asOf);

  const payrollPayable = pickAccount(bs, PAYROLL_PAYABLE);
  const whtVendors = pickAccount(bs, WHT_VENDOR);
  const accountsPayable = pickAccount(bs, AP);

  const sirAatifLoanToCompany = pickAccount(bs, AATIF_LOAN);
  const payrollWithHoldingTaxPayable = pickAccount(bs, PAYROLL_WHT);

  const totalPayables =
    payrollPayable +
    whtVendors +
    accountsPayable +
    sirAatifLoanToCompany +
    payrollWithHoldingTaxPayable;

  const loanAgainstSalary = pickAccount(bs, LOAN_SALARY);
  const taxWithheld = pickAccount(bs, TAX_WITHHELD);
  const totalReceivables = loanAgainstSalary + taxWithheld;

  return { asOf, totalPayables, totalReceivables };
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

    // months=6 will return monthlySeries for chart in the SAME response
    const monthsRaw = searchParams.get("months");
    const months = Math.max(1, Math.min(24, Number(monthsRaw ?? "1") || 1)); // 1..24

    // 1) Detailed current asOf (accurate)
    const { computed, apAging } = await computeDetailedAsOf(asOf);

    // 2) Optional monthly series (FAST totals)
    let monthlySeries: Array<{ month: string; asOf: string; payables: number; receivables: number }> | undefined;

    if (months > 1) {
      const dates = monthEndDatesUTC(asOf, months);

      // Concurrency 2 to avoid QBO throttling
      const series = await mapLimit(dates, 2, async (d) => {
        const t = await computeFastTotals(d);
        return {
          month: d.slice(0, 7),
          asOf: d,
          payables: t.totalPayables,
          receivables: t.totalReceivables,
        };
      });

      monthlySeries = series;
    }

    return NextResponse.json({
      ok: true,
      asOf,
      currency: "PKR",

      payables: {
        // keep old shape for your existing UI
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

      // NEW: month-end series returned from backend (fast)
      monthlySeries,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
