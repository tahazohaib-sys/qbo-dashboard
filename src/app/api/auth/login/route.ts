import { NextResponse } from "next/server";
import { hashPassword, isAdminEmail, sendAuthEmail, verifyPassword } from "@/lib/auth";
import { createLoginVerificationCode, ensureAdminUser, findUserByEmail, setUserPassword } from "@/lib/auth-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    let user = isAdminEmail(email) ? await ensureAdminUser(email) : await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ ok: false, error: "This email is not approved for dashboard access." }, { status: 401 });
    }

    if (!isAdminEmail(email)) {
      if (user.status === "approval_pending") {
        return NextResponse.json({ ok: false, error: "Your access request is waiting for approval." }, { status: 403 });
      }
      if (user.status === "rejected") {
        return NextResponse.json({ ok: false, error: "Your access request was rejected." }, { status: 403 });
      }
      if (user.status !== "approved") {
        return NextResponse.json({ ok: false, error: "This account is not approved." }, { status: 403 });
      }
    }

    if (user.password_hash) {
      if (!verifyPassword(password, user.password_hash)) {
        return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
      }
    } else {
      user = await setUserPassword(user.id, hashPassword(password));
      if (!user) return NextResponse.json({ ok: false, error: "Could not set password for this account." }, { status: 500 });
    }

    const verificationCode = await createLoginVerificationCode(user.id);
    const emailResult = await sendAuthEmail({
      to: user.email,
      subject: "Your QBO Dashboard login code",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Login verification code</h2>
          <p>Use this six-digit code to finish signing in to the QBO Dashboard:</p>
          <div style="display:inline-block;background:#ecfeff;color:#0e7490;border:1px solid #67e8f9;border-radius:12px;padding:12px 18px;font-size:28px;font-weight:800;letter-spacing:6px">${verificationCode}</div>
          <p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      needsCode: true,
      isAdmin: isAdminEmail(user.email),
      message: emailResult.sent
        ? "Verification code sent. Enter the code below to finish logging in."
        : "Email delivery is not configured yet. Use the development login code below to continue testing this login.",
      devVerificationCode: emailResult.sent ? undefined : verificationCode,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Login failed." }, { status: 500 });
  }
}
