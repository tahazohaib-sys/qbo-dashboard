import { NextResponse } from "next/server";
import { getPlaidMappings, upsertExternalBalance } from "@/lib/db";
import { getPlaidAccountsForAccessToken } from "@/lib/plaid";

export async function POST(req: Request) {
  try {
    const mappings = await getPlaidMappings();

    const results: Array<{ qboAccountId: string; ok: boolean; message?: string }> = [];

    for (const m of mappings) {
      try {
        const accounts = await getPlaidAccountsForAccessToken(m.plaid_access_token);
        const acct = accounts.find((a) => a.account_id === m.plaid_account_id);
        if (!acct) {
          results.push({ qboAccountId: m.qbo_account_id, ok: false, message: "Plaid account not found" });
          continue;
        }

        await upsertExternalBalance(m.qbo_account_id, acct.balances.current, acct.balances.available ?? null, "plaid");
        results.push({ qboAccountId: m.qbo_account_id, ok: true });
      } catch (err: any) {
        results.push({ qboAccountId: m.qbo_account_id, ok: false, message: err?.message ?? String(err) });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
