import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type MonthBucket = {
  month: string;
  inflow: number;
  outflow: number;
  heads: Record<string, { inflow: number; outflow: number }>;
};

type ColMeta = { idx: number; titleL: string; keyL: string };

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKeyFromDate(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    return input.slice(0, 7);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toNumber(v: any): number {
  if (v == null) return Number.NaN;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "-") return Number.NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function getColumns(report: any): ColMeta[] {
  const cols = report?.Columns?.Column ?? [];
  if (!Array.isArray(cols)) return [];
  return cols.map((c: any, idx: number) => ({
    idx,
    titleL: String(c?.ColTitle ?? "").trim().toLowerCase(),
    keyL: String(c?.ColKey ?? c?.ColType ?? "").trim().toLowerCase(),
  }));
}

function findCol(cols: ColMeta[], candidates: string[]) {
  for (const cand of candidates) {
    const c = cand.toLowerCase();
    const hit = cols.find((x) => x.keyL === c || x.keyL.includes(c) || x.titleL.includes(c));
    if (hit) return hit.idx;
  }
  return -1;
}

function getCell(colData: any[], idx: number): string {
  if (idx < 0) return "";
  const v = colData?.[idx]?.value;
  return v == null ? "" : String(v);
}

function collectReportDataRows(rows: any, out: any[] = []) {
  const arr = Array.isArray(rows) ? rows : rows?.Row;
  if (!Array.isArray(arr)) return out;
  for (const r of arr) {
    const type = String(r?.type ?? "");
    if (type === "Data" && Array.isArray(r?.ColData)) out.push(r);
    if (r?.Rows) collectReportDataRows(r.Rows, out);
  }
  return out;
}

async function getCashBankAccounts() {
  const bankQuery = `
    SELECT Id, Name, AccountType, AccountSubType, Active
    FROM Account
    WHERE Active = true AND AccountType = 'Bank'
    ORDER BY Name
  `.trim();

  const cashQuery = `
    SELECT Id, Name, AccountType, AccountSubType, Active
    FROM Account
    WHERE Active = true AND AccountSubType = 'CashOnHand'
    ORDER BY Name
  `.trim();

  const [bankData, cashData] = await Promise.all([
    qboFetch(`query?query=${encodeURIComponent(bankQuery)}`),
    qboFetch(`query?query=${encodeURIComponent(cashQuery)}`),
  ]);

  const raw = [...(bankData?.QueryResponse?.Account ?? []), ...(cashData?.QueryResponse?.Account ?? [])];
  const dedup = new Map<string, { id: string; name: string }>();
  for (const a of raw) {
    const id = String(a?.Id ?? "");
    const name = String(a?.Name ?? "");
    if (id && name) dedup.set(id, { id, name });
  }
  return Array.from(dedup.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchGeneralLedgerByAccountId(accountId: string, start_date: string, end_date: string) {
  const path =
    `reports/GeneralLedger?start_date=${encodeURIComponent(start_date)}` +
    `&end_date=${encodeURIComponent(end_date)}` +
    `&account=${encodeURIComponent(accountId)}` +
    `&summarize_column_by=Total`;

  return qboFetch(path);
}

function ensureMonthBucket(map: Map<string, MonthBucket>, month: string) {
  if (!map.has(month)) {
    map.set(month, { month, inflow: 0, outflow: 0, heads: {} });
  }
  return map.get(month)!;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start_date = url.searchParams.get("start_date") || ymd(new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1));
    const end_date = url.searchParams.get("end_date") || ymd(new Date());

    const accounts = await getCashBankAccounts();
    const monthMap = new Map<string, MonthBucket>();

    for (const account of accounts) {
      const report = await fetchGeneralLedgerByAccountId(account.id, start_date, end_date);
      const cols = getColumns(report);
      const dataRows = collectReportDataRows(report?.Rows, []);

      const idxDate = findCol(cols, ["date", "txndate"]);
      const idxAmount = findCol(cols, ["amount", "amt"]);
      const idxDebit = findCol(cols, ["debit"]);
      const idxCredit = findCol(cols, ["credit"]);
      const idxHead = findCol(cols, ["split", "account", "distribution account", "name", "memo"]);

      for (const row of dataRows) {
        const cd = row?.ColData ?? [];
        const date = getCell(cd, idxDate).trim();
        if (!date || date.toLowerCase() === "total") continue;

        let amount = Number.NaN;
        if (idxAmount >= 0) {
          amount = toNumber(getCell(cd, idxAmount));
        }
        if (!Number.isFinite(amount)) {
          const debit = toNumber(getCell(cd, idxDebit));
          const credit = toNumber(getCell(cd, idxCredit));
          amount = (Number.isFinite(debit) ? debit : 0) - (Number.isFinite(credit) ? credit : 0);
        }
        if (!Number.isFinite(amount) || amount === 0) continue;

        const month = monthKeyFromDate(date);
        const headRaw = getCell(cd, idxHead).trim();
        const head = headRaw || "Uncategorized";

        const bucket = ensureMonthBucket(monthMap, month);
        if (!bucket.heads[head]) {
          bucket.heads[head] = { inflow: 0, outflow: 0 };
        }

        if (amount > 0) {
          bucket.inflow += amount;
          bucket.heads[head].inflow += amount;
        } else {
          const abs = Math.abs(amount);
          bucket.outflow += abs;
          bucket.heads[head].outflow += abs;
        }
      }
    }

    const months = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        inflow: m.inflow,
        outflow: m.outflow,
        netFlow: m.inflow - m.outflow,
        heads: Object.entries(m.heads)
          .map(([head, values]) => ({ head, inflow: values.inflow, outflow: values.outflow }))
          .sort((a, b) => Math.max(b.inflow, b.outflow) - Math.max(a.inflow, a.outflow)),
      }));

    return NextResponse.json({
      ok: true,
      start_date,
      end_date,
      accountCount: accounts.length,
      accounts,
      months,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
