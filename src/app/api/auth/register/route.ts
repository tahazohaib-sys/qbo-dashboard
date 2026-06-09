import { NextResponse } from "next/server";
import { ADMIN_APPROVER_EMAIL, hashPassword, sendAuthEmail } from "@/lib/auth";
import { createEmailVerificationCode, findUserByEmail, upsertPendingUser } from "@/lib/auth-db";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing?.status === "approved") {
      return NextResponse.json({ ok: false, error: "This email is already approved. Please log in." }, { status: 409 });
    }

    const user = await upsertPendingUser(email, hashPassword(password));
    const verificationCode = await createEmailVerificationCode(user.id);
    const emailResult = await sendAuthEmail({
      to: user.email,
      subject: "Your QBO Dashboard verification code",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Verify your email</h2>
          <p>Use this verification code to continue your QBO Dashboard access request:</p>
          <div style="display:inline-block;background:#ecfeff;color:#0e7490;border:1px solid #67e8f9;border-radius:12px;padding:12px 18px;font-size:28px;font-weight:800;letter-spacing:6px">${verificationCode}</div>
          <p>After verification, your request will be forwarded to ${ADMIN_APPROVER_EMAIL} for approval.</p>
          <p>This code expires in 15 minutes.</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      message: emailResult.sent
        ? "Verification code sent. Enter the code below to verify your email."
        : "Email delivery is not configured yet. Use the development verification code below to continue testing this request.",
      needsCode: true,
      devVerificationCode: emailResult.sent ? undefined : verificationCode,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Registration failed." }, { status: 500 });
  }
}
