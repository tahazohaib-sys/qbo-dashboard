import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, isAdminEmail, SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "@/lib/auth";
import { consumeLoginVerificationCode } from "@/lib/auth-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();

    const user = await consumeLoginVerificationCode(email, code);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Invalid or expired login code." }, { status: 400 });
    }

    const isAdmin = isAdminEmail(user.email);
    const res = NextResponse.json({ ok: true, isAdmin });
    res.cookies.set(AUTH_COOKIE, createSessionToken({ sub: user.id, email: user.email, isAdmin }), sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Verification failed." }, { status: 500 });
  }
}
