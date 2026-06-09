import { NextResponse } from "next/server";
import { consumeAuthToken, decideUserApproval } from "@/lib/auth-db";

function resultPage(title: string, message: string) {
  return new NextResponse(
    `<!doctype html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;background:#061429;color:#e2e8f0;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center">
      <main style="max-width:520px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(15,23,42,.82);padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.35)">
        <h1 style="margin:0 0 10px;color:white">${title}</h1>
        <p style="line-height:1.6">${message}</p>
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

    return resultPage(
      decision === "approve" ? "Access approved" : "Access rejected",
      decision === "approve"
        ? `${user.email} can now log in to the dashboard.`
        : `${user.email} has been rejected and cannot log in.`
    );
  } catch (e: any) {
    return resultPage("Decision failed", e?.message ?? "Something went wrong.");
  }
}
