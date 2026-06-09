import { NextResponse } from "next/server";
import { ADMIN_APPROVER_EMAIL, getBaseUrl, sendAuthEmail } from "@/lib/auth";
import { consumeEmailVerificationCode, createAuthToken, markEmailVerified } from "@/lib/auth-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();

    const userId = await consumeEmailVerificationCode(email, code);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Invalid or expired verification code." }, { status: 400 });
    }

    const user = await markEmailVerified(userId);
    if (!user) return NextResponse.json({ ok: false, error: "We could not find this access request." }, { status: 404 });

    const approvalToken = await createAuthToken(user.id, "approval", 72);
    const baseUrl = getBaseUrl(req);
    const approveUrl = `${baseUrl}/api/auth/decision?token=${encodeURIComponent(approvalToken)}&decision=approve`;
    const rejectUrl = `${baseUrl}/api/auth/decision?token=${encodeURIComponent(approvalToken)}&decision=reject`;

    const emailResult = await sendAuthEmail({
      to: ADMIN_APPROVER_EMAIL,
      subject: `Finance dashboard access request: ${user.email}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Finance dashboard access request</h2>
          <p>The following person is seeking permission to access the finance dashboard:</p>
          <div style="display:inline-block;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px 14px;font-size:16px"><strong>${user.email}</strong></div>
          <p>Access will be given only after approval.</p>
          <p>
            <a href="${approveUrl}" style="display:inline-block;background:#059669;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px">Approve</a>
            <a href="${rejectUrl}" style="display:inline-block;background:#e11d48;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700">Reject</a>
          </p>
          <p>This approval link expires in 72 hours.</p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      message: `Your request has been forwarded for approval to ${ADMIN_APPROVER_EMAIL}.`,
      devApproval: emailResult.sent ? undefined : { approveUrl, rejectUrl },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Verification failed." }, { status: 500 });
  }
}
