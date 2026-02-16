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
  balanceSource: "bank-feed" | "posted";
};

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeAccounts(raw: any[]): CashBankAccount[] {
  return (raw ?? [])
    .map((a: any) => {
      const currency = a?.CurrencyRef?.value || "PKR";
      const postedBalance = toNumber(a?.CurrentBalance);

      // Linked-bank accounts can expose a separate live bank/feed balance in some tenants.
      const rawBankBalance = a?.BankBalance ?? a?.OnlineBankingBalance ?? a?.CurrentBankBalance;
      const bankBalance = toNumber(rawBankBalance);
      const hasLiveBankBalance = rawBankBalance != null && String(rawBankBalance).trim() !== "";

      const useBankFeed = String(a?.AccountType ?? "") === "Bank" && hasLiveBankBalance;
      return {
        id: String(a?.Id ?? ""),
        name: String(a?.Name ?? ""),
        accountType: String(a?.AccountType ?? ""),
        accountSubType: a?.AccountSubType ? String(a.AccountSubType) : undefined,
        currency,
        currentBalance: useBankFeed ? bankBalance : postedBalance,
        postedBalance,
        bankBalance,
        balanceSource: useBankFeed ? ("bank-feed" as const) : ("posted" as const),
      };
    })
    .filter((a: CashBankAccount) => Boolean(a.id) && Boolean(a.name));
}

async function runAccountQuery(whereClause: string) {
  const query = `
    SELECT *
    FROM Account
    WHERE ${whereClause}
    ORDER BY Name
  `.trim();

  const data = await qboFetch(`query?query=${encodeURIComponent(query)}`);
  return data?.QueryResponse?.Account ?? [];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeZero = (url.searchParams.get("includeZero") ?? "true") !== "false";

    /**
     * IMPORTANT:
     * Many QBO tenants reject OR / parentheses in QBOQL.
     * So we run two queries and merge:
     * 1) Bank accounts
     * 2) CashOnHand accounts
     *
     * Active is boolean in QBOQL; "true" is accepted by most tenants.
     */
    const bankRaw = await runAccountQuery(`Active = true AND AccountType = 'Bank'`);
    const cashRaw = await runAccountQuery(`Active = true AND AccountSubType = 'CashOnHand'`);

    const all = [...normalizeAccounts(bankRaw), ...normalizeAccounts(cashRaw)];

    // De-duplicate by account id
    const map = new Map<string, CashBankAccount>();
    for (const a of all) map.set(a.id, a);

    let accounts = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (!includeZero) {
      accounts = accounts.filter((a) => a.currentBalance !== 0);
    }

    // totals grouped by currency (NO conversion)
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
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
