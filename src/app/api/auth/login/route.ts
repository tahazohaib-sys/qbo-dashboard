import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, SESSION_MAX_AGE_SECONDS, verifyPassword } from "@/lib/auth";
import { findUserByEmail } from "@/lib/auth-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }

    if (user.status === "email_pending") {
      return NextResponse.json({ ok: false, error: "Please verify your email before logging in." }, { status: 403 });
    }
    if (user.status === "approval_pending") {
      return NextResponse.json({ ok: false, error: "Your access request is waiting for approval." }, { status: 403 });
    }
    if (user.status === "rejected") {
      return NextResponse.json({ ok: false, error: "Your access request was rejected." }, { status: 403 });
    }
    if (user.status !== "approved") {
      return NextResponse.json({ ok: false, error: "This account is not approved." }, { status: 403 });
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
    return NextResponse.json({ ok: false, error: e?.message ?? "Login failed." }, { status: 500 });
  }
}
