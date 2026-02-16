import { NextResponse } from "next/server";
import { upsertPlaidMapping, upsertExternalBalance } from "@/lib/db";
import { getPlaidAccountsForAccessToken } from "@/lib/plaid";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { qboAccountId, plaidAccessToken, plaidAccountId, plaidItemId } = body;
    if (!qboAccountId || !plaidAccessToken || !plaidAccountId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const mapping = await upsertPlaidMapping({
      qboAccountId,
      plaidItemId: plaidItemId ?? plaidAccountId,
      plaidAccountId,
      plaidAccessToken,
    });

    // fetch initial balance and save
    try {
      const accounts = await getPlaidAccountsForAccessToken(plaidAccessToken);
      const acct = accounts.find((a) => a.account_id === plaidAccountId);
      if (acct) {
        await upsertExternalBalance(qboAccountId, acct.balances.current, acct.balances.available ?? null, "plaid");
      }
    } catch (e) {
      // ignore plaid fetch errors for mapping creation
    }

    return NextResponse.json({ ok: true, mapping });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
