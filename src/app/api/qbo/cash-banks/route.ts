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
  currentBalance: number; // value rendered on dashboard
  postedBalance: number; // accounting ledger (posted) balance
  bankBalance: number; // linked bank/feed balance when QBO exposes it
  pendingImpact: number; // bankBalance - postedBalance
  balanceSource: "bank-feed" | "posted";
  feedBalanceAvailable: boolean;
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

function extractLiveBankBalance(account: any): { hasValue: boolean; value: number } {
  // QBO tenants expose feed values differently (or not at all via Accounting API).
  const onlineInfo = account?.OnlineBankingInfo ?? account?.BankingInfo ?? account?.BankInfo;

  const raw =
    pickFirstNonEmpty(onlineInfo, [
      "BankBalance",
      "OnlineBankingBalance",
      "CurrentBankBalance",
      "AvailableBalance",
    ]) ??
    pickFirstNonEmpty(account, [
      "BankBalance",
      "OnlineBankingBalance",
      "CurrentBankBalance",
      "AvailableBalance",
    ]);

  if (raw == null) return { hasValue: false, value: 0 };
  return { hasValue: true, value: toNumber(raw) };
}

function normalizeAccounts(raw: any[]): CashBankAccount[] {
  return (raw ?? [])
    .map((a: any) => {
      const currency = a?.CurrencyRef?.value || "PKR";
      const postedBalance = toNumber(a?.CurrentBalance);

      const { hasValue: hasLiveBankBalance, value: bankBalance } = extractLiveBankBalance(a);
      const isBankAccount = String(a?.AccountType ?? "") === "Bank";
      const useBankFeed = isBankAccount && hasLiveBankBalance;

      return {
        id: String(a?.Id ?? ""),
        name: String(a?.Name ?? ""),
        accountType: String(a?.AccountType ?? ""),
        accountSubType: a?.AccountSubType ? String(a.AccountSubType) : undefined,
        currency,
        currentBalance: useBankFeed ? bankBalance : postedBalance,
        postedBalance,
        bankBalance,
        pendingImpact: useBankFeed ? bankBalance - postedBalance : 0,
        balanceSource: useBankFeed ? ("bank-feed" as const) : ("posted" as const),
        feedBalanceAvailable: hasLiveBankBalance,
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

    const totalsByCurrency: Record<string, number> = {};
    for (const a of accounts) {
      totalsByCurrency[a.currency] = (totalsByCurrency[a.currency] ?? 0) + a.currentBalance;
    }

    const bankAccounts = accounts.filter((a) => a.accountType === "Bank");
    const feedEnabledCount = bankAccounts.filter((a) => a.feedBalanceAvailable).length;

    return NextResponse.json({
      ok: true,
      count: accounts.length,
      accounts,
      totalsByCurrency,
      fetchedAt: new Date().toISOString(),
      feedBalanceCoverage: {
        bankAccounts: bankAccounts.length,
        feedEnabledAccounts: feedEnabledCount,
        note:
          "Bank-feed balances appear only after QBO Banking Update pulls latest transactions; otherwise posted balance is shown.",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
