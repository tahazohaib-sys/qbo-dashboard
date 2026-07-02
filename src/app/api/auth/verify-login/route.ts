import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
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

    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, createSessionToken({ sub: user.id, email: user.email }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Verification failed." }, { status: 500 });
  }
}
