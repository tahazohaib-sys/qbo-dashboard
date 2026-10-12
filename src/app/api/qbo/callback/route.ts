import { NextResponse } from "next/server";
import { exchangeCodeForTokens, QBO_STATE_COOKIE } from "@/lib/qbo";
import { saveTokens } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    return NextResponse.json(
      { ok: false, error, error_description: errorDesc },
      { status: 400 }
    );
  }

  // The state must match the one this browser got from /api/qbo/start.
  const state = url.searchParams.get("state");
  const expectedState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${QBO_STATE_COOKIE}=`))
    ?.slice(QBO_STATE_COOKIE.length + 1);
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { ok: false, message: "Invalid or expired QuickBooks connection request. Start again from the dashboard." },
      { status: 400 }
    );
  }

  if (!code || !realmId) {
    return NextResponse.json(
      { ok: false, message: "Missing code or realmId from QuickBooks callback." },
      { status: 400 }
    );
  }

  const tokens = await exchangeCodeForTokens(code);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await saveTokens({
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  });

  // ✅ Always redirect back to the same host that received the callback
  // - Vercel: https://qbo-dashboard.vercel.app
  // - Local:  http://localhost:3000
  const res = NextResponse.redirect(new URL("/dashboard", url.origin));
  res.cookies.set(QBO_STATE_COOKIE, "", { path: "/api/qbo", maxAge: 0 });
  return res;
}
