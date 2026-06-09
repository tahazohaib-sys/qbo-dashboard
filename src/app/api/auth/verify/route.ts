import { NextResponse } from "next/server";
import { ADMIN_APPROVER_EMAIL, getBaseUrl, sendAuthEmail } from "@/lib/auth";
import { consumeAuthToken, createAuthToken, markEmailVerified } from "@/lib/auth-db";

function resultPage(title: string, message: string) {
  return new NextResponse(
    `<!doctype html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;background:#061429;color:#e2e8f0;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center">
      <main style="max-width:520px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(15,23,42,.82);padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)">
        <h1 style="margin:0 0 10px;color:white">${title}</h1>
        <p style="line-height:1.6">${message}</p>
        <a href="/login" style="display:inline-block;margin-top:12px;color:#67e8f9;text-decoration:none;font-weight:700">Back to login</a>
      </main>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const userId = await consumeAuthToken(token, "email_verify");
    if (!userId) return resultPage("Invalid verification link", "This verification link is invalid, expired, or already used.");

    const user = await markEmailVerified(userId);
    if (!user) return resultPage("Verification failed", "We could not find this access request.");

    const approvalToken = await createAuthToken(user.id, "approval", 72);
    const baseUrl = getBaseUrl(req);
    const approveUrl = `${baseUrl}/api/auth/decision?token=${encodeURIComponent(approvalToken)}&decision=approve`;
    const rejectUrl = `${baseUrl}/api/auth/decision?token=${encodeURIComponent(approvalToken)}&decision=reject`;

    const emailResult = await sendAuthEmail({
      to: ADMIN_APPROVER_EMAIL,
      subject: `Dashboard access request: ${user.email}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <h2>Dashboard access request</h2>
          <p><strong>${user.email}</strong> verified their email and is requesting access to the QBO Dashboard.</p>
          <p>
            <a href="${approveUrl}" style="display:inline-block;background:#059669;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700;margin-right:8px">Approve</a>
            <a href="${rejectUrl}" style="display:inline-block;background:#e11d48;color:white;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:700">Reject</a>
          </p>
          <p>This approval link expires in 72 hours.</p>
        </div>
      `,
    });

    const devNote = emailResult.sent
      ? ""
      : `<br/><br/>Development approval links:<br/><a style="color:#67e8f9" href="${approveUrl}">Approve</a> | <a style="color:#fda4af" href="${rejectUrl}">Reject</a>`;

    return resultPage(
      "Email verified",
      `Your email has been verified. Your access request has been sent to ${ADMIN_APPROVER_EMAIL} for approval.${devNote}`
    );
  } catch (e: any) {
    return resultPage("Verification failed", e?.message ?? "Something went wrong.");
  }
}
