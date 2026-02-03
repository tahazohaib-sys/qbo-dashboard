import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type TxnRow = {
  txnId: string | null;
  date: string;
  txnType: string;
  name: string;
  memo: string;

  amountHome: number;

  foreignCurrency: string | null;
  exchangeRate: number | null;
  amountForeign: number | null;

  entity: string | null;
};

function toNumber(v: any): number {
  if (v == null) return NaN;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "" || s === "-") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

type ColMeta = { idx: number; titleL: string; keyL: string };

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

function extractTxnId(row: any): string | null {
  if (row?.Id != null) return String(row.Id);

  const linked = row?.LinkedTxn;
  if (Array.isArray(linked) && linked.length > 0) {
    const tx = linked.find((x: any) => x?.TxnId != null);
    if (tx?.TxnId != null) return String(tx.TxnId);
  }

  const cd = row?.ColData;
  if (Array.isArray(cd)) {
    for (const c of cd) {
      if (c?.id != null) return String(c.id);

      const href = c?.href;
      if (href && typeof href === "string") {
        const m = href.match(/\/(\d+)(\?.*)?$/);
        if (m?.[1]) return m[1];
      }
    }
  }

  return null;
}

async function getCompanyHomeCurrency(): Promise<string> {
  try {
    const info = await qboFetch("companyinfo/1");
    const cur = info?.CompanyInfo?.CurrencyRef?.value;
    return cur ? String(cur) : "PKR";
  } catch {
    return "PKR";
  }
}

async function getAccountInfo(accountId: string): Promise<{ name: string | null; currency: string | null }> {
  const query = `
    SELECT Id, Name, CurrencyRef
    FROM Account
    WHERE Id = '${accountId}'
  `.trim();

  const data = await qboFetch(`query?query=${encodeURIComponent(query)}`);
  const acc = data?.QueryResponse?.Account?.[0];

  return {
    name: acc?.Name ? String(acc.Name) : null,
    currency: acc?.CurrencyRef?.value ? String(acc.CurrencyRef.value) : null,
  };
}

function mapTxnTypeToEntity(txnType: string): string | null {
  const t = (txnType || "").toLowerCase().trim();
  if (t === "deposit") return "deposit";
  if (t === "transfer") return "transfer";
  if (t === "journal entry" || t === "journal") return "journalentry";
  if (t === "expense" || t === "purchase") return "purchase";
  if (t === "check") return "purchase";
  if (t === "bill payment") return "billpayment";
  return null;
}

async function fetchTxnDetails(entity: string, id: string) {
  return qboFetch(`${entity}/${encodeURIComponent(id)}`);
}

function extractCurrencyAndRate(entity: string, payload: any): { currency: string | null; rate: number | null } {
  const key = entity.charAt(0).toUpperCase() + entity.slice(1);
  const obj = payload?.[key] ?? payload?.[entity] ?? payload;

  const currency = obj?.CurrencyRef?.value ? String(obj.CurrencyRef.value) : null;
  const rate = obj?.ExchangeRate != null ? Number(obj.ExchangeRate) : null;

  return {
    currency: currency && currency !== "" ? currency : null,
    rate: Number.isFinite(rate as any) ? (rate as number) : null,
  };
}

function computeForeignAmount(
  amountHome: number,
  homeCurrency: string,
  txnCurrency: string | null,
  rate: number | null
) {
  if (!txnCurrency || txnCurrency === homeCurrency) {
    return { foreignCurrency: homeCurrency, amountForeign: amountHome };
  }
  if (rate && rate > 0) {
    return { foreignCurrency: txnCurrency, amountForeign: amountHome / rate };
  }
  return { foreignCurrency: txnCurrency, amountForeign: null };
}

/**
 * ✅ GeneralLedger filtered by *AccountId* (this is the real fix)
 */
async function fetchGeneralLedgerByAccountId(accountId: string, start_date: string, end_date: string) {
  const path =
    `reports/GeneralLedger?start_date=${encodeURIComponent(start_date)}` +
    `&end_date=${encodeURIComponent(end_date)}` +
    `&account=${encodeURIComponent(accountId)}` +
    `&summarize_column_by=Total`;

  return qboFetch(path);
}

function parseDateMs(s: string): number {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId") ?? "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5), 1), 25);

    if (!accountId) {
      return NextResponse.json({ ok: false, error: "Missing accountId" }, { status: 400 });
    }

    const homeCurrency = await getCompanyHomeCurrency();
    const { name: accountName, currency: accountCurrency } = await getAccountInfo(accountId);

    if (!accountName) {
      return NextResponse.json({ ok: false, error: "Account not found in QBO" }, { status: 404 });
    }

    // last 180 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 180);

    const start_date = ymd(start);
    const end_date = ymd(end);

    const report = await fetchGeneralLedgerByAccountId(accountId, start_date, end_date);

    const cols = getColumns(report);
    const dataRows = collectReportDataRows(report?.Rows, []);

    // Flexible column detection (GL varies by tenant)
    let idxDate = findCol(cols, ["date", "txndate"]);
    let idxType = findCol(cols, ["transaction type", "txntype", "type"]);
    let idxName = findCol(cols, ["name", "customer", "vendor", "payee"]);
    let idxMemo = findCol(cols, ["memo", "description"]);

    const idxAmount = findCol(cols, ["amount", "amt"]);
    const idxDebit = findCol(cols, ["debit"]);
    const idxCredit = findCol(cols, ["credit"]);

    // Fallback if keys are missing
    if (idxDate < 0 && cols.length > 0) idxDate = 0;
    if (idxType < 0 && cols.length > 1) idxType = 1;

    const baseParsed = dataRows
      .map((r: any) => {
        const cd = r?.ColData ?? [];

        const date = getCell(cd, idxDate).trim();
        if (!date || date.toLowerCase() === "total") return null;

        const txnType = getCell(cd, idxType).trim() || "—";
        const name = getCell(cd, idxName).trim() || "—";
        const memo = getCell(cd, idxMemo).trim() || "—";

        // Amount logic: Amount OR (Debit - Credit)
        let amountHome = 0;

        const amt = idxAmount >= 0 ? toNumber(getCell(cd, idxAmount)) : NaN;
        if (Number.isFinite(amt)) {
          amountHome = amt;
        } else {
          const d = idxDebit >= 0 ? toNumber(getCell(cd, idxDebit)) : NaN;
          const c = idxCredit >= 0 ? toNumber(getCell(cd, idxCredit)) : NaN;
          const debit = Number.isFinite(d) ? d : 0;
          const credit = Number.isFinite(c) ? c : 0;
          amountHome = debit - credit;
        }

        const txnId = extractTxnId(r);

        return { txnId, date, txnType, name, memo, amountHome };
      })
      .filter(Boolean) as Array<{
      txnId: string | null;
      date: string;
      txnType: string;
      name: string;
      memo: string;
      amountHome: number;
    }>;

    const baseSorted = baseParsed
      .slice()
      .sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date))
      .slice(0, limit);

    // Optional enrichment (FX)
    const enriched: TxnRow[] = await Promise.all(
      baseSorted.map(async (x) => {
        const entity = mapTxnTypeToEntity(x.txnType);

        if (!x.txnId || !entity) {
          return {
            txnId: x.txnId,
            date: x.date,
            txnType: x.txnType,
            name: x.name,
            memo: x.memo,
            amountHome: x.amountHome,
            foreignCurrency: accountCurrency ?? null,
            exchangeRate: null,
            amountForeign: null,
            entity,
          };
        }

        try {
          const payload = await fetchTxnDetails(entity, x.txnId);
          const { currency, rate } = extractCurrencyAndRate(entity, payload);

          const { foreignCurrency, amountForeign } = computeForeignAmount(
            x.amountHome,
            homeCurrency,
            currency ?? accountCurrency,
            rate
          );

          return {
            txnId: x.txnId,
            date: x.date,
            txnType: x.txnType,
            name: x.name,
            memo: x.memo,
            amountHome: x.amountHome,
            foreignCurrency,
            exchangeRate: rate,
            amountForeign,
            entity,
          };
        } catch {
          return {
            txnId: x.txnId,
            date: x.date,
            txnType: x.txnType,
            name: x.name,
            memo: x.memo,
            amountHome: x.amountHome,
            foreignCurrency: accountCurrency ?? null,
            exchangeRate: null,
            amountForeign: null,
            entity,
          };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      accountId,
      accountName,
      accountCurrency,
      homeCurrency,
      start_date,
      end_date,
      count: enriched.length,
      transactions: enriched,
      note: "GeneralLedger per accountId. Amount parsed from Amount OR Debit/Credit.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
