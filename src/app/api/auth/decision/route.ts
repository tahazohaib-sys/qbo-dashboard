import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/auth";
import { accessLevelOf, consumeAuthToken, decideUserApproval } from "@/lib/auth-db";
import { sendAccessEmail } from "@/lib/access-emails";

function resultPage(title: string, message: string) {
  return new NextResponse(
    `<!doctype html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;background:linear-gradient(135deg,#07152b,#050914 48%,#081321);color:#e2e8f0;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center;padding:18px">
      <main style="max-width:560px;border:1px solid rgba(255,255,255,.12);border-radius:28px;background:rgba(2,6,23,.72);padding:30px;box-shadow:0 34px 110px rgba(0,0,0,.48)">
        <div style="font-size:12px;font-weight:800;letter-spacing:.28em;text-transform:uppercase;color:#a7f3d0;margin-bottom:12px">QBO Dashboard</div>
        <h1 style="margin:0 0 12px;color:white;font-size:32px;line-height:1.05">${title}</h1>
        <p style="line-height:1.7;color:#cbd5e1">${message}</p>
      </main>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const decisionRaw = url.searchParams.get("decision");
    const decision = decisionRaw === "approve" || decisionRaw === "reject" ? decisionRaw : null;
    if (!decision) return resultPage("Invalid action", "Approval links must include approve or reject.");

    const userId = await consumeAuthToken(token, "approval");
    if (!userId) return resultPage("Invalid approval link", "This approval link is invalid, expired, or already used.");

    const user = await decideUserApproval(userId, decision);
    if (!user) return resultPage("Decision failed", "We could not find this access request.");

    const mail = await sendAccessEmail({
      kind: decision === "approve" ? "approved" : "rejected",
      email: user.email,
      level: accessLevelOf(user),
      baseUrl: getBaseUrl(req),
    });
    const mailNote = mail.sent
      ? ` An email about this decision was sent to ${user.email}.`
      : ` The email to ${user.email} could not be sent (${mail.error}).`;

    return resultPage(
      decision === "approve" ? "Access approved" : "Access rejected",
      decision === "approve"
        ? `${user.email} can now log in, set a password, and complete six-digit code verification. Access: all dashboard modules (change it on Manage Access).${mailNote}`
        : `${user.email} has been rejected and cannot log in.${mailNote}`
    );
  } catch (e: unknown) {
    return resultPage("Decision failed", e instanceof Error ? e.message : "Something went wrong.");
  }
}
