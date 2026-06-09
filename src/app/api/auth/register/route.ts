import { NextResponse } from "next/server";
import { ADMIN_APPROVER_EMAIL, getBaseUrl, hashPassword, sendAuthEmail } from "@/lib/auth";
import { createAuthToken, findUserByEmail, upsertPendingUser } from "@/lib/auth-db";

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
    const rawToken = await createAuthToken(user.id, "email_verify", 24);
    const verifyUrl = `${getBaseUrl(req)}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;
    const emailResult = await sendAuthEmail({
      to: user.email,
      subject: "Verify your QBO Dashboard access request",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Verify your email</h2>
          <p>Please verify this email address before your dashboard access request is sent to ${ADMIN_APPROVER_EMAIL}.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;background:#0891b2;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700">Verify email</a></p>
          <p>This link expires in 24 hours.</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      message: emailResult.sent
        ? "Verification email sent. Please verify your email to request approval."
        : "Email delivery is not configured yet. Use the verification link below to continue testing this request.",
      devVerifyUrl: emailResult.sent ? undefined : verifyUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Registration failed." }, { status: 500 });
  }
}
