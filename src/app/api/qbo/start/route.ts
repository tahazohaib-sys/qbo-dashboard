import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URL; // ✅ use ONE consistent env var

  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Missing env var: QBO_CLIENT_ID" },
      { status: 500 }
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { ok: false, error: "Missing env var: QBO_REDIRECT_URL" },
      { status: 500 }
    );
  }

  // Intuit connect URL (same for sandbox & production)
  const baseUrl = "https://appcenter.intuit.com/connect/oauth2";

  // scopes (space-separated then encoded)
  const scope = "com.intuit.quickbooks.accounting openid profile email";

  const authUrl =
    `${baseUrl}?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=secureRandomState` +
    `&locale=en-gb`;

  return NextResponse.redirect(authUrl);
}
