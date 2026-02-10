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
 * ---------- FETCHERS ----------
 */
async function fetchBalanceSheet(asOf: string) {
  // qboFetch likely already adds base URL + minorversion
  return qboFetch(`reports/BalanceSheet?as_of_date=${encodeURIComponent(asOf)}`);
}

async function fetchAPAgingSummary(asOf: string) {
  return qboFetch(`reports/APAgingSummary?report_date=${encodeURIComponent(asOf)}`);
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

    // Some QBO reports have "Total" rows
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
 * This fallback returns OPEN balances (current outstanding), not historical,
 * but we keep it for cases where report fails.
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
 */
async function sumBillsTotalAmtUpto(asOf: string): Promise<number> {
  // QBO Query supports date literals: 'YYYY-MM-DD'
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
  const [bills, payments] = await Promise.all([
    sumBillsTotalAmtUpto(asOf),
    sumBillPaymentsTotalAmtUpto(asOf),
  ]);
  const outstanding = bills - payments;
  return outstanding > 0 ? outstanding : 0;
}

/**
 * ---------- API ----------
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const asOf = searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);

    // ===== BALANCE SHEET ACCOUNTS =====
    // Current Payables
    const PAYROLL_PAYABLE = "Payroll Payable";
    const WHT_VENDOR = "With Holding Tax Payable Vendors";
    const AP = "Accounts Payable (A/P)"; // we'll still read this name from QBO

    // Long Term Payables
    const AATIF_LOAN = "Sir Aatif Loan to Company";
    const PAYROLL_WHT = "Payroll With Holding Tax Payable";

    // Receivables
    const LOAN_SALARY = "Loan Against Salary";
    const TAX_WITHHELD = "Tax Withheld";

    const bs = await fetchBalanceSheet(asOf);

    // ---- Current Payables (Balance Sheet)
    const payrollPayable = pickAccount(bs, PAYROLL_PAYABLE);
    const whtVendors = pickAccount(bs, WHT_VENDOR);

    // ✅ Vendor Bills: reconstructed month-end payable (true growth)
    const vendorBills = await computeVendorBillsAsOf(asOf);

    // We still keep accountsPayable field for backward compatibility, but it will now reflect vendor bills.
    const accountsPayable = vendorBills;

    const totalCurrentPayables = payrollPayable + whtVendors + accountsPayable;

    // ---- Long Term Payables (Balance Sheet)
    const sirAatifLoanToCompany = pickAccount(bs, AATIF_LOAN);
    const payrollWithHoldingTaxPayable = pickAccount(bs, PAYROLL_WHT);
    const totalLongTermPayables = sirAatifLoanToCompany + payrollWithHoldingTaxPayable;

    const totalPayables = totalCurrentPayables + totalLongTermPayables;

    // ---- Receivables (Balance Sheet as-of)
    const loanAgainstSalary = pickAccount(bs, LOAN_SALARY);
    const taxWithheld = pickAccount(bs, TAX_WITHHELD);
    const totalReceivables = loanAgainstSalary + taxWithheld;

    // ---- AP Aging (as-of)
    let apAging;
    try {
      const aging = await fetchAPAgingSummary(asOf);
      apAging = parseAPAgingReport(aging);
    } catch {
      const bills = await queryOpenBills();
      apAging = buildAPAgingFromBills(asOf, bills);
    }

    return NextResponse.json({
      ok: true,
      asOf,
      currency: "PKR",

      payables: {
        current: {
          payrollPayable,
          withHoldingTaxPayableVendors: whtVendors,

          // keep the field name for your existing UI
          accountsPayable,

          // extra explicit field (use it in UI label as "Vendor Bills")
          vendorBills,

          totalCurrentPayables,
        },
        longTerm: {
          sirAatifLoanToCompany,
          payrollWithHoldingTaxPayable,
          totalLongTermPayables,
        },
        totalPayables,
      },

      receivables: {
        loanAgainstSalary,
        taxWithheld,
        totalReceivables,
      },

      apAging,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
