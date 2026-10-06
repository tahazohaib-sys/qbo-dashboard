import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Expense breakdown for the P&L "Expense Composition" drill-down.
 *
 * Input: one or more P&L expense account ids and a date range.
 * For every month in the range, the General Ledger is read for these
 * accounts only. Each line is grouped:
 *   account -> item (payee / vendor / employee name) -> month
 * Amount = debit - credit, the same sign the P&L report uses for expenses.
 *
 * The GL is read one month at a time, so one response never holds more than
 * one month of these accounts.
 */

const MAX_MONTHS = 36;
const MAX_ENTRIES_PER_ITEM = 300;
const MONTH_BATCH = 4;

type Entry = {
  date: string;
  txnType: string;
  docNum: string;
  memo: string;
  amount: number;
};

type Item = {
  key: string;
  name: string;
  monthly: number[];
  total: number;
  entryCount: number;
  entries: Entry[];
};

type AccountBreakdown = {
  accountId: string;
  accountName: string;
  monthly: number[];
  total: number;
  items: Item[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function monthWindows(start: string, end: string) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out: Array<{ key: string; label: string; start: string; end: string }> = [];
  for (let i = sy * 12 + sm - 1; i <= ey * 12 + em - 1 && out.length < MAX_MONTHS; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    const mm = String(m).padStart(2, "0");
    const last = new Date(y, m, 0).getDate();
    const mStart = `${y}-${mm}-01`;
    const mEnd = `${y}-${mm}-${String(last).padStart(2, "0")}`;
    out.push({
      key: `${y}-${mm}`,
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      start: mStart < start ? start : mStart,
      end: mEnd > end ? end : mEnd,
    });
  }
  return out;
}

type ColMeta = { idx: number; keys: string[]; title: string };

/**
 * A GL column names its key in MetaData[ColKey], ColKey or ColType,
 * depending on the report and tenant. All three are kept, so matching
 * never depends on the (possibly localized) header text.
 */
function getColumns(report: any): ColMeta[] {
  const cols = report?.Columns?.Column ?? [];
  if (!Array.isArray(cols)) return [];
  return cols.map((c: any, idx: number) => {
    const meta = Array.isArray(c?.MetaData) ? c.MetaData : [];
    const keys = [meta.find((m: any) => m?.Name === "ColKey")?.Value, c?.ColKey, c?.ColType]
      .filter((k) => k != null && k !== "")
      .map((k) => String(k).toLowerCase());
    return { idx, keys, title: String(c?.ColTitle ?? "").trim().toLowerCase() };
  });
}

function findCol(cols: ColMeta[], keys: string[], titles: string[]) {
  for (const k of keys) {
    const hit = cols.find((c) => c.keys.includes(k));
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
  return { value: c?.value == null ? "" : String(c.value).trim(), id: c?.id == null ? "" : String(c.id) };
}

type GlLine = { accountId: string; accountName: string; name: string; entry: Entry };

type AmountCols = ["debt_amt", "credit_amt"] | ["debt_home_amt", "credit_home_amt"];
const PLAIN_COLS: AmountCols = ["debt_amt", "credit_amt"];
const HOME_COLS: AmountCols = ["debt_home_amt", "credit_home_amt"];

/**
 * Companies with multicurrency on expose the GL debit / credit in home
 * currency as debt_home_amt / credit_home_amt instead of debt_amt /
 * credit_amt. Pick the set from the company preferences.
 */
async function preferredAmountCols(): Promise<AmountCols> {
  try {
    const prefs = await qboFetch("preferences");
    return prefs?.Preferences?.CurrencyPrefs?.MultiCurrencyEnabled === true ? HOME_COLS : PLAIN_COLS;
  } catch {
    return PLAIN_COLS;
  }
}

async function fetchGl(accountIds: string[], w: { start: string; end: string }, method: string, amountCols: AmountCols) {
  const columns = ["tx_date", "txn_type", "doc_num", "name", "memo", "account_name", ...amountCols].join(",");
  return qboFetch(
    `reports/GeneralLedger?start_date=${encodeURIComponent(w.start)}&end_date=${encodeURIComponent(w.end)}` +
      `&accounting_method=${encodeURIComponent(method)}` +
      `&account=${encodeURIComponent(accountIds.join(","))}` +
      `&columns=${encodeURIComponent(columns)}`
  );
}

async function fetchMonthLines(
  accountIds: string[],
  w: { start: string; end: string },
  method: string,
  amountCols: AmountCols
): Promise<GlLine[]> {
  let report: any;
  try {
    report = await fetchGl(accountIds, w, method, amountCols);
  } catch (e) {
    // If the preferred amount columns are refused, try the other set once.
    const other = amountCols === HOME_COLS ? PLAIN_COLS : HOME_COLS;
    try {
      report = await fetchGl(accountIds, w, method, other);
    } catch {
      throw e;
    }
  }

  const cols = getColumns(report);
  const iDate = findCol(cols, ["tx_date"], ["date"]);
  const iType = findCol(cols, ["txn_type"], ["transaction type"]);
  const iNum = findCol(cols, ["doc_num"], ["num", "no."]);
  const iName = findCol(cols, ["name"], ["name"]);
  const iMemo = findCol(cols, ["memo"], ["memo/description", "memo", "description"]);
  const iAcct = findCol(cols, ["account_name"], ["account"]);
  const iDebit = findCol(cols, ["debt_home_amt", "debt_amt"], ["debit"]);
  const iCredit = findCol(cols, ["credit_home_amt", "credit_amt"], ["credit"]);

  const wanted = new Set(accountIds);
  const out: GlLine[] = [];

  const walk = (rows: any, secId: string, secName: string) => {
    const arr = Array.isArray(rows) ? rows : rows?.Row;
    if (!Array.isArray(arr)) return;
    for (const r of arr) {
      if (r?.type === "Section" || r?.Header || r?.Rows) {
        const h = r?.Header?.ColData?.[0];
        walk(r?.Rows, h?.id != null ? String(h.id) : secId, h?.value != null ? String(h.value) : secName);
        continue;
      }
      if (r?.type !== "Data" || !Array.isArray(r?.ColData)) continue;
      const cd = r.ColData;
      const type = cell(cd, iType);
      if (!type.id && !cell(cd, iDate).id) continue; // beginning balance / totals

      const acct = cell(cd, iAcct);
      const accountId = acct.id || secId;
      // A parent account in the filter can bring its sub-accounts along; the
      // P&L shows those as their own rows, so they are left out here.
      if (!wanted.has(accountId)) continue;

      const amount = toNumber(cell(cd, iDebit).value) - toNumber(cell(cd, iCredit).value);
      if (amount === 0) continue;

      out.push({
        accountId,
        accountName: acct.value || secName,
        name: cell(cd, iName).value,
        entry: {
          date: cell(cd, iDate).value,
          txnType: type.value || "Entry",
          docNum: cell(cd, iNum).value,
          memo: cell(cd, iMemo).value,
          amount,
        },
      });
    }
  };
  walk(report?.Rows, "", "");
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start_date") ?? "";
    const end = url.searchParams.get("end_date") ?? "";
    const method = url.searchParams.get("accounting_method") === "Cash" ? "Cash" : "Accrual";
    const accountIds = (url.searchParams.get("accounts") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));

    if (!isYmd(start) || !isYmd(end) || start > end) {
      return NextResponse.json({ ok: false, error: "Invalid start_date / end_date." }, { status: 400 });
    }
    if (accountIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No expense accounts given." }, { status: 400 });
    }

    const months = monthWindows(start, end);
    const amountCols = await preferredAmountCols();
    const lines: GlLine[][] = new Array(months.length);
    for (let i = 0; i < months.length; i += MONTH_BATCH) {
      const batch = months.slice(i, i + MONTH_BATCH);
      const res = await Promise.all(batch.map((w) => fetchMonthLines(accountIds, w, method, amountCols)));
      res.forEach((r, j) => (lines[i + j] = r));
    }

    const accounts = new Map<string, AccountBreakdown & { itemMap: Map<string, Item> }>();
    lines.forEach((monthLines, mi) => {
      for (const l of monthLines) {
        let a = accounts.get(l.accountId);
        if (!a) {
          a = {
            accountId: l.accountId,
            accountName: l.accountName,
            monthly: months.map(() => 0),
            total: 0,
            items: [],
            itemMap: new Map(),
          };
          accounts.set(l.accountId, a);
        }
        a.monthly[mi] += l.entry.amount;
        a.total += l.entry.amount;

        const itemName = l.name || `${l.entry.txnType} (no payee)`;
        const key = itemName.toLowerCase();
        let it = a.itemMap.get(key);
        if (!it) {
          it = { key, name: itemName, monthly: months.map(() => 0), total: 0, entryCount: 0, entries: [] };
          a.itemMap.set(key, it);
        }
        it.monthly[mi] += l.entry.amount;
        it.total += l.entry.amount;
        it.entryCount += 1;
        it.entries.push(l.entry);
      }
    });

    const accountRows: AccountBreakdown[] = Array.from(accounts.values())
      .map(({ itemMap, ...a }) => ({
        ...a,
        monthly: a.monthly.map(round2),
        total: round2(a.total),
        items: Array.from(itemMap.values())
          .map((it) => ({
            ...it,
            monthly: it.monthly.map(round2),
            total: round2(it.total),
            // Newest first, then cap, so the most recent entries are kept.
            entries: it.entries
              .map((e) => ({ ...e, amount: round2(e.amount) }))
              .sort((x, y) => Date.parse(y.date) - Date.parse(x.date))
              .slice(0, MAX_ENTRIES_PER_ITEM),
          }))
          .filter((it) => it.total !== 0 || it.monthly.some((v) => v !== 0))
          .sort((x, y) => y.total - x.total),
      }))
      .sort((x, y) => y.total - x.total);

    const monthly = months.map((_, i) => round2(accountRows.reduce((s, a) => s + a.monthly[i], 0)));

    return NextResponse.json({
      ok: true,
      start_date: start,
      end_date: end,
      accountingMethod: method,
      months: months.map(({ key, label }) => ({ key, label })),
      monthly,
      total: round2(monthly.reduce((s, v) => s + v, 0)),
      accounts: accountRows,
      truncatedMonths: monthWindows(start, end).length >= MAX_MONTHS && months[months.length - 1].end < end,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
