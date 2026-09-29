import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";
import { buildDirectorReport } from "@/lib/cashflow-report";

export const dynamic = "force-dynamic";

/**
 * Monthly Cash Flow
 *
 * Cash accounts = chart-of-accounts entries whose detail type is "Bank"
 * (AccountType = 'Bank') or "Cash on hand" (AccountSubType = 'CashOnHand').
 *
 * For the selected month we read the General Ledger (all accounts) and group
 * the lines by transaction. A transaction is used only when at least one of
 * its lines posts to a cash account. The other (non-cash) lines of that
 * transaction are the account heads of the cash movement:
 *   - credit on the head -> cash inflow  (e.g. Sales, Accounts Receivable)
 *   - debit  on the head -> cash outflow (e.g. Salaries, Accounts Payable)
 * Because every transaction balances, total inflow - total outflow of the
 * heads always equals the net change of the cash accounts.
 * Transactions with only cash lines (bank-to-bank transfers) are reported
 * separately as internal transfers.
 * Failed payments and returned cheques are netted out (see cancelReversals),
 * so only the entry with the final effect counts.
 */

type QboAccount = {
  id: string;
  name: string;
  fullName: string;
  accountType: string;
  accountSubType: string;
  classification: string;
};

type GlLine = {
  accountId: string;
  accountName: string;
  txnKey: string;
  txnId: string;
  txnType: string;
  date: string;
  docNum: string;
  name: string;
  memo: string;
  debit: number;
  credit: number;
};

type HeadTxn = {
  txnId: string;
  txnType: string;
  date: string;
  docNum: string;
  name: string;
  memo: string;
  amount: number;
  cashAccounts: string[];
};

type HeadSummary = {
  accountId: string;
  accountName: string;
  accountType: string;
  accountSubType: string;
  classification: string;
  amount: number;
  txnCount: number;
  transactions: HeadTxn[];
};

type CashAccountSummary = {
  accountId: string;
  accountName: string;
  accountSubType: string;
  inflow: number;
  outflow: number;
  transfersIn: number;
  transfersOut: number;
  net: number;
  txnCount: number;
};

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(y, mo, 0).getDate();
  const mm = String(mo).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

async function getHomeCurrency(): Promise<string> {
  try {
    const info = await qboFetch("companyinfo/1");
    const cur = info?.CompanyInfo?.CurrencyRef?.value;
    return cur ? String(cur) : "PKR";
  } catch {
    return "PKR";
  }
}

async function queryAccounts(where: string): Promise<any[]> {
  const out: any[] = [];
  const pageSize = 1000;
  for (let start = 1; start < 20000; start += pageSize) {
    const q =
      `SELECT Id, Name, FullyQualifiedName, AccountType, AccountSubType, Classification FROM Account` +
      `${where ? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    const data = await qboFetch(`query?query=${encodeURIComponent(q)}`);
    const rows = data?.QueryResponse?.Account ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Loads the full chart of accounts, inactive accounts included, because a
 * past month can hold entries in an account that is now inactive.
 */
async function getAllAccounts(): Promise<Map<string, QboAccount>> {
  let raw: any[];
  try {
    raw = await queryAccounts("Active IN (true, false)");
  } catch {
    raw = await queryAccounts("");
  }

  const map = new Map<string, QboAccount>();
  for (const a of raw) {
    const id = String(a?.Id ?? "");
    if (!id) continue;
    map.set(id, {
      id,
      name: String(a?.Name ?? ""),
      fullName: String(a?.FullyQualifiedName ?? a?.Name ?? ""),
      accountType: String(a?.AccountType ?? ""),
      accountSubType: String(a?.AccountSubType ?? ""),
      classification: String(a?.Classification ?? ""),
    });
  }
  return map;
}

function isCashAccount(a: QboAccount | undefined) {
  if (!a) return false;
  return a.accountType === "Bank" || a.accountSubType === "CashOnHand";
}

type ColMeta = { idx: number; key: string; title: string };

function getColumns(report: any): ColMeta[] {
  const cols = report?.Columns?.Column ?? [];
  if (!Array.isArray(cols)) return [];
  return cols.map((c: any, idx: number) => {
    const meta = Array.isArray(c?.MetaData) ? c.MetaData : [];
    const colKey = meta.find((m: any) => m?.Name === "ColKey")?.Value;
    return {
      idx,
      key: String(colKey ?? "").toLowerCase(),
      title: String(c?.ColTitle ?? "").trim().toLowerCase(),
    };
  });
}

function findCol(cols: ColMeta[], keys: string[], titles: string[]) {
  for (const k of keys) {
    const hit = cols.find((c) => c.key === k);
    if (hit) return hit.idx;
  }
  for (const t of titles) {
    const hit = cols.find((c) => c.title === t || c.title.startsWith(t));
    if (hit) return hit.idx;
  }
  return -1;
}

function cell(colData: any[], idx: number) {
  if (idx < 0) return { value: "", id: "" };
  const c = colData?.[idx];
  return { value: c?.value == null ? "" : String(c.value), id: c?.id == null ? "" : String(c.id) };
}

async function fetchGeneralLedger(start: string, end: string, method: string) {
  const columns = [
    "tx_date",
    "txn_type",
    "doc_num",
    "name",
    "memo",
    "account_name",
    "debt_amt",
    "credit_amt",
  ].join(",");

  const path =
    `reports/GeneralLedger?start_date=${encodeURIComponent(start)}` +
    `&end_date=${encodeURIComponent(end)}` +
    `&accounting_method=${encodeURIComponent(method)}` +
    `&columns=${encodeURIComponent(columns)}`;

  return qboFetch(path);
}

/**
 * Walks the GL sections. Each section header names the account of the data
 * rows below it (sub-accounts are nested sections).
 */
function collectGlLines(report: any, accountsByName: Map<string, string>): GlLine[] {
  const cols = getColumns(report);
  const iDate = findCol(cols, ["tx_date"], ["date"]);
  const iType = findCol(cols, ["txn_type"], ["transaction type"]);
  const iNum = findCol(cols, ["doc_num"], ["num", "no."]);
  const iName = findCol(cols, ["name"], ["name"]);
  const iMemo = findCol(cols, ["memo"], ["memo/description", "memo", "description"]);
  const iAcct = findCol(cols, ["account_name"], ["account"]);
  const iDebit = findCol(cols, ["debt_amt"], ["debit"]);
  const iCredit = findCol(cols, ["credit_amt"], ["credit"]);

  const out: GlLine[] = [];

  const walk = (rows: any, sectionAccountId: string, sectionAccountName: string) => {
    const arr = Array.isArray(rows) ? rows : rows?.Row;
    if (!Array.isArray(arr)) return;

    for (const r of arr) {
      if (r?.type === "Section" || r?.Header || r?.Rows) {
        const h = r?.Header?.ColData?.[0];
        const hId = h?.id != null ? String(h.id) : "";
        const hName = h?.value != null ? String(h.value) : "";
        walk(r?.Rows, hId || sectionAccountId, hName || sectionAccountName);
        continue;
      }

      if (r?.type !== "Data" || !Array.isArray(r?.ColData)) continue;
      const cd = r.ColData;

      const type = cell(cd, iType);
      const txnId = type.id || cell(cd, iDate).id;
      if (!txnId) continue; // beginning balance and summary rows have no transaction id

      const acct = cell(cd, iAcct);
      let accountId = acct.id || sectionAccountId;
      const accountName = acct.value || sectionAccountName;
      if (!accountId && accountName) accountId = accountsByName.get(accountName.toLowerCase()) ?? "";
      if (!accountId) continue;

      const debit = toNumber(cell(cd, iDebit).value);
      const credit = toNumber(cell(cd, iCredit).value);
      if (debit === 0 && credit === 0) continue;

      const txnType = type.value.trim() || "Transaction";

      out.push({
        accountId,
        accountName,
        txnKey: `${txnType}#${txnId}`,
        txnId,
        txnType,
        date: cell(cd, iDate).value,
        docNum: cell(cd, iNum).value,
        name: cell(cd, iName).value,
        memo: cell(cd, iMemo).value,
        debit,
        credit,
      });
    }
  };

  walk(report?.Rows, "", "");
  return out;
}

type Movement = {
  line: GlLine;
  direction: "in" | "out";
  amount: number;
  /** Set only when the transaction touches exactly one cash account. */
  cashAccountId: string | null;
  cashNames: string[];
};

type ReversalEntry = {
  txnId: string;
  txnType: string;
  date: string;
  docNum: string;
  name: string;
  memo: string;
  direction: "in" | "out";
};

type ReversalPair = {
  accountId: string;
  accountName: string;
  cashAccountId: string;
  amount: number;
  entries: [ReversalEntry, ReversalEntry];
};

function reversalEntry(m: Movement): ReversalEntry {
  const l = m.line;
  return { txnId: l.txnId, txnType: l.txnType, date: l.date, docNum: l.docNum, name: l.name, memo: l.memo, direction: m.direction };
}

/**
 * Failed payments and returned (bounced) cheques leave entries of the same
 * amount in both directions: e.g. a cheque deposit of 50,000 against
 * Accounts Receivable and later a "returned cheque" of 50,000 against the
 * same head and bank. Only the final effect must count.
 *
 * Within the month, entries with the same cash account, the same head and
 * the same amount are paired in date order: each inflow cancels one outflow.
 * Unpaired entries are the final effect. For example out, in, out, in, out
 * of the same amount leaves one outflow.
 *
 * A cancelled pair is an equal in and out, so net cash flow never changes.
 * Two entries in the same direction are not removed: both moved cash.
 */
function cancelReversals(movements: Movement[]): { kept: Movement[]; reversals: ReversalPair[] } {
  const groups = new Map<string, Movement[]>();
  const kept: Movement[] = [];

  for (const m of movements) {
    if (!m.cashAccountId) {
      kept.push(m);
      continue;
    }
    const key = `${m.cashAccountId}|${m.line.accountId}|${Math.round(m.amount * 100)}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  const reversals: ReversalPair[] = [];

  for (const list of groups.values()) {
    list.sort((a, b) => Date.parse(a.line.date) - Date.parse(b.line.date) || Number(a.line.txnId) - Number(b.line.txnId));
    const open: Movement[] = [];

    for (const m of list) {
      const opposite = open.filter((o) => o.direction !== m.direction);
      if (opposite.length === 0) {
        open.push(m);
        continue;
      }
      // Prefer the latest open entry for the same customer / vendor.
      const sameName = opposite.filter((o) => o.line.name && o.line.name === m.line.name);
      const match = (sameName.length ? sameName : opposite)[(sameName.length ? sameName : opposite).length - 1];
      open.splice(open.indexOf(match), 1);
      reversals.push({
        accountId: m.line.accountId,
        accountName: m.line.accountName,
        cashAccountId: m.cashAccountId!,
        amount: m.amount,
        entries: [reversalEntry(match), reversalEntry(m)],
      });
    }

    kept.push(...open);
  }

  return { kept, reversals };
}

async function summarizeMonth(
  range: { start: string; end: string },
  method: "Accrual" | "Cash",
  accounts: Map<string, QboAccount>
) {
  const report = await fetchGeneralLedger(range.start, range.end, method);

  const accountsByName = new Map<string, string>();
  for (const a of accounts.values()) {
    accountsByName.set(a.name.toLowerCase(), a.id);
    accountsByName.set(a.fullName.toLowerCase(), a.id);
  }

  const lines = collectGlLines(report, accountsByName);

  // Group GL lines by transaction
  const byTxn = new Map<string, GlLine[]>();
  for (const l of lines) {
    const list = byTxn.get(l.txnKey);
    if (list) list.push(l);
    else byTxn.set(l.txnKey, [l]);
  }

  const inflowHeads = new Map<string, HeadSummary>();
  const outflowHeads = new Map<string, HeadSummary>();
  const cashAccounts = new Map<string, CashAccountSummary & { txnKeys: Set<string> }>();
  let internalTransfers = 0;
  let cashTxnCount = 0;

  const headFor = (map: Map<string, HeadSummary>, l: GlLine) => {
    let h = map.get(l.accountId);
    if (!h) {
      const a = accounts.get(l.accountId);
      h = {
        accountId: l.accountId,
        accountName: a?.fullName || l.accountName,
        accountType: a?.accountType ?? "",
        accountSubType: a?.accountSubType ?? "",
        classification: a?.classification ?? "",
        amount: 0,
        txnCount: 0,
        transactions: [],
      };
      map.set(l.accountId, h);
    }
    return h;
  };

  const addHeadTxn = (h: HeadSummary, l: GlLine, amount: number, cashNames: string[]) => {
    h.amount += amount;
    const existing = h.transactions.find((t) => t.txnId === l.txnId && t.txnType === l.txnType);
    if (existing) {
      existing.amount += amount;
      return;
    }
    h.txnCount += 1;
    h.transactions.push({
      txnId: l.txnId,
      txnType: l.txnType,
      date: l.date,
      docNum: l.docNum,
      name: l.name,
      memo: l.memo,
      amount,
      cashAccounts: cashNames,
    });
  };

  // One movement = one head line of a transaction that touches a cash account.
  const movements: Movement[] = [];

  for (const [txnKey, txnLines] of byTxn) {
    const cashLines = txnLines.filter((l) => isCashAccount(accounts.get(l.accountId)));
    if (cashLines.length === 0) continue; // no entry in a Bank / Cash on hand account

    cashTxnCount += 1;
    const otherLines = txnLines.filter((l) => !isCashAccount(accounts.get(l.accountId)));
    const isTransfer = otherLines.length === 0;
    const cashIds = Array.from(new Set(cashLines.map((l) => l.accountId)));
    const cashNames = cashIds.map((id) => accounts.get(id)?.fullName || cashLines.find((l) => l.accountId === id)!.accountName);

    for (const l of cashLines) {
      let s = cashAccounts.get(l.accountId);
      if (!s) {
        const a = accounts.get(l.accountId);
        s = {
          accountId: l.accountId,
          accountName: a?.fullName || l.accountName,
          accountSubType: a?.accountSubType ?? "",
          inflow: 0,
          outflow: 0,
          transfersIn: 0,
          transfersOut: 0,
          net: 0,
          txnCount: 0,
          txnKeys: new Set(),
        };
        cashAccounts.set(l.accountId, s);
      }
      if (isTransfer) {
        s.transfersIn += l.debit;
        s.transfersOut += l.credit;
      } else {
        s.inflow += l.debit;
        s.outflow += l.credit;
      }
      s.net += l.debit - l.credit;
      s.txnKeys.add(txnKey);
    }

    if (isTransfer) {
      internalTransfers += cashLines.reduce((sum, l) => sum + l.debit, 0);
      continue;
    }

    for (const l of otherLines) {
      const cashAccountId = cashIds.length === 1 ? cashIds[0] : null;
      if (l.credit > 0) movements.push({ line: l, direction: "in", amount: l.credit, cashAccountId, cashNames });
      if (l.debit > 0) movements.push({ line: l, direction: "out", amount: l.debit, cashAccountId, cashNames });
    }
  }

  const { kept, reversals } = cancelReversals(movements);

  // A cancelled pair moved the same amount in and out of one cash account.
  for (const r of reversals) {
    const s = cashAccounts.get(r.cashAccountId);
    if (!s) continue;
    s.inflow -= r.amount;
    s.outflow -= r.amount;
  }

  for (const m of kept) {
    const map = m.direction === "in" ? inflowHeads : outflowHeads;
    addHeadTxn(headFor(map, m.line), m.line, m.amount, m.cashNames);
  }

  const finishHeads = (map: Map<string, HeadSummary>) =>
    Array.from(map.values())
      .map((h) => ({
        ...h,
        amount: round2(h.amount),
        transactions: h.transactions
          .map((t) => ({ ...t, amount: round2(t.amount) }))
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
      }))
      .filter((h) => h.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

  const inflows = finishHeads(inflowHeads);
  const outflows = finishHeads(outflowHeads);

  const cashAccountRows: CashAccountSummary[] = Array.from(cashAccounts.values())
    .map(({ txnKeys, ...s }) => ({
      ...s,
      inflow: round2(s.inflow),
      outflow: round2(s.outflow),
      transfersIn: round2(s.transfersIn),
      transfersOut: round2(s.transfersOut),
      net: round2(s.net),
      txnCount: txnKeys.size,
    }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName));

  const totalInflow = round2(inflows.reduce((s, h) => s + h.amount, 0));
  const totalOutflow = round2(outflows.reduce((s, h) => s + h.amount, 0));

  return {
    totals: {
      inflow: totalInflow,
      outflow: totalOutflow,
      net: round2(totalInflow - totalOutflow),
      internalTransfers: round2(internalTransfers),
      transactionCount: cashTxnCount,
      reversedAmount: round2(reversals.reduce((sum, r) => sum + r.amount, 0)),
      reversedCount: reversals.length,
    },
    reversals: reversals.map((r) => ({
      ...r,
      accountName: accounts.get(r.accountId)?.fullName || r.accountName,
      cashAccountName: accounts.get(r.cashAccountId)?.fullName || r.cashAccountId,
    })),
    inflows,
    outflows,
    cashAccounts: cashAccountRows,
  };
}

function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Cash held in Bank / Cash on hand accounts at the end of a day, in home
 * currency, from the Balance Sheet. Returns null when the report cannot be read.
 */
async function getCashBalance(asOf: string, accounts: Map<string, QboAccount>): Promise<number | null> {
  try {
    const rep = await qboFetch(
      `reports/BalanceSheet?start_date=${encodeURIComponent(asOf)}&end_date=${encodeURIComponent(asOf)}` +
        `&summarize_column_by=Total`
    );
    let total = 0;
    let found = false;
    const walk = (rows: any) => {
      const arr = Array.isArray(rows) ? rows : rows?.Row;
      if (!Array.isArray(arr)) return;
      for (const r of arr) {
        if (r?.Rows) walk(r.Rows);
        if (r?.type !== "Data" || !Array.isArray(r?.ColData)) continue;
        const id = r.ColData[0]?.id != null ? String(r.ColData[0].id) : "";
        if (!id || !isCashAccount(accounts.get(id))) continue;
        total += toNumber(r.ColData[r.ColData.length - 1]?.value);
        found = true;
      }
    };
    walk(rep?.Rows);
    return found ? round2(total) : 0;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? "";
    const method = url.searchParams.get("accounting_method") === "Cash" ? "Cash" : "Accrual";

    const range = monthRange(month);
    if (!range) {
      return NextResponse.json({ ok: false, error: "Invalid month. Use YYYY-MM." }, { status: 400 });
    }
    const prevMonth = previousMonth(month);
    const prevRange = monthRange(prevMonth)!;

    const [accounts, homeCurrency] = await Promise.all([getAllAccounts(), getHomeCurrency()]);

    const [current, previous, closingCash] = await Promise.all([
      summarizeMonth(range, method, accounts),
      summarizeMonth(prevRange, method, accounts).catch(() => null),
      getCashBalance(range.end, accounts),
    ]);

    // Cash at the start of the month = cash at the end - net change in the month.
    const netCashChange = round2(current.cashAccounts.reduce((sum, a) => sum + a.net, 0));
    const openingCash = closingCash == null ? null : round2(closingCash - netCashChange);

    const directorReport = buildDirectorReport({
      month,
      currency: homeCurrency,
      current,
      previous: previous ? { month: prevMonth, ...previous } : null,
      openingCash,
      closingCash,
    });

    return NextResponse.json({
      ok: true,
      month,
      start_date: range.start,
      end_date: range.end,
      accountingMethod: method,
      homeCurrency,
      ...current,
      directorReport,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
