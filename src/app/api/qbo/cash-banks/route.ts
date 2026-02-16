// src/app/api/qbo/cash-banks/route.ts
import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type CashBankAccount = {
  id: string;
  name: string;
  accountType: string;
  accountSubType?: string;
  currency: string;
  currentBalance: number; // native currency balance shown on UI
  postedBalance: number; // bookkeeping/posted balance
  bankBalance: number; // linked bank feed balance (if available)
  pendingImpact: number; // bankBalance - postedBalance when bank feed balance exists
  balanceSource: "bank-feed" | "posted";
};

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickFirstNonEmpty(obj: any, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
}

function extractLiveBankBalance(account: any, detail: any): { hasValue: boolean; value: number } {
  // Different QBO tenants/minor versions expose different field names.
  const raw =
    pickFirstNonEmpty(detail, [
      "BankBalance",
      "OnlineBankingBalance",
      "CurrentBankBalance",
      "AvailableBalance",
      "Balance",
    ]) ??
    pickFirstNonEmpty(account, ["BankBalance", "OnlineBankingBalance", "CurrentBankBalance", "AvailableBalance", "Balance"]);

  if (raw == null) return { hasValue: false, value: 0 };
  return { hasValue: true, value: toNumber(raw) };
}

function normalizeAccounts(raw: any[], detailsById: Map<string, any>): CashBankAccount[] {
  return (raw ?? [])
    .map((a: any) => {
      const id = String(a?.Id ?? "");
      const detail = detailsById.get(id) ?? null;

      const currency = a?.CurrencyRef?.value || detail?.CurrencyRef?.value || "PKR";
      const postedBalance = toNumber(a?.CurrentBalance ?? detail?.CurrentBalance);

      const { hasValue: hasLiveBankBalance, value: bankBalance } = extractLiveBankBalance(a, detail);
      const useBankFeed = String(a?.AccountType ?? detail?.AccountType ?? "") === "Bank" && hasLiveBankBalance;

      const currentBalance = useBankFeed ? bankBalance : postedBalance;

      return {
        id,
        name: String(a?.Name ?? detail?.Name ?? ""),
        accountType: String(a?.AccountType ?? detail?.AccountType ?? ""),
        accountSubType: a?.AccountSubType ? String(a.AccountSubType) : detail?.AccountSubType ? String(detail.AccountSubType) : undefined,
        currency,
        currentBalance,
        postedBalance,
        bankBalance,
        pendingImpact: useBankFeed ? bankBalance - postedBalance : 0,
        balanceSource: useBankFeed ? ("bank-feed" as const) : ("posted" as const),
      };
    })
    .filter((a: CashBankAccount) => Boolean(a.id) && Boolean(a.name));
}

async function runAccountQuery(whereClause: string) {
  const query = `
    SELECT Id, Name, AccountType, AccountSubType, CurrencyRef, CurrentBalance, Active
    FROM Account
    WHERE ${whereClause}
    ORDER BY Name
  `.trim();

  const data = await qboFetch(`query?query=${encodeURIComponent(query)}`);
  return data?.QueryResponse?.Account ?? [];
}

async function fetchAccountDetails(accountIds: string[]) {
  const detailsById = new Map<string, any>();

  await Promise.all(
    accountIds.map(async (id) => {
      try {
        const detail = await qboFetch(`account/${encodeURIComponent(id)}`);
        const acc = detail?.Account;
        if (acc?.Id != null) detailsById.set(String(acc.Id), acc);
      } catch {
        // If detailed fetch fails for one account, keep the endpoint resilient.
      }
    })
  );

  return detailsById;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeZero = (url.searchParams.get("includeZero") ?? "true") !== "false";

    const bankRaw = await runAccountQuery(`Active = true AND AccountType = 'Bank'`);
    const cashRaw = await runAccountQuery(`Active = true AND AccountSubType = 'CashOnHand'`);

    const accountIds = [...bankRaw, ...cashRaw]
      .map((a: any) => String(a?.Id ?? ""))
      .filter((id: string) => Boolean(id));

    const detailsById = await fetchAccountDetails(accountIds);

    const all = [...normalizeAccounts(bankRaw, detailsById), ...normalizeAccounts(cashRaw, detailsById)];

    // De-duplicate by account id
    const map = new Map<string, CashBankAccount>();
    for (const a of all) map.set(a.id, a);

    let accounts = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (!includeZero) {
      accounts = accounts.filter((a) => a.currentBalance !== 0);
    }

    const totalsByCurrency: Record<string, number> = {};
    for (const a of accounts) {
      totalsByCurrency[a.currency] = (totalsByCurrency[a.currency] ?? 0) + a.currentBalance;
    }

    return NextResponse.json({
      ok: true,
      count: accounts.length,
      accounts,
      totalsByCurrency,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
