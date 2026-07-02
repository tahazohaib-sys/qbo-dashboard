import { NextResponse } from "next/server";
import { sendAuthEmail, verifyPassword } from "@/lib/auth";
import { createLoginVerificationCode, findUserByEmail } from "@/lib/auth-db";

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
      message: emailResult.sent
        ? "Verification code sent. Enter the code below to finish logging in."
        : "Email delivery is not configured yet. Use the development login code below to continue testing this login.",
      devVerificationCode: emailResult.sent ? undefined : verificationCode,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Login failed." }, { status: 500 });
  }
}
