import { getTokens, saveTokens } from "@/lib/db";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function tokenBaseUrl() {
  // Token endpoint is the same for sandbox & prod
  return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = mustEnv("QBO_CLIENT_ID");
  const clientSecret = mustEnv("QBO_CLIENT_SECRET");
  // ✅ Use the SAME env var your start route uses
  const redirectUri = mustEnv("QBO_REDIRECT_URL");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);

  const res = await fetch(tokenBaseUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${txt}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = mustEnv("QBO_CLIENT_ID");
  const clientSecret = mustEnv("QBO_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const res = await fetch(tokenBaseUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${txt}`);
  }

  return (await res.json()) as TokenResponse;
}

/**
 * Always returns a valid access token (refreshes if expired/near-expiry)
 */
export async function getValidAccessToken() {
  const t = await getTokens();
  if (!t) throw new Error("QuickBooks is not connected yet.");

  const expiresAtMs = new Date(t.expiresAt).getTime();
  const now = Date.now();

  // refresh 2 minutes early
  if (expiresAtMs - now > 2 * 60 * 1000) {
    return { accessToken: t.accessToken, realmId: t.realmId };
  }

  const refreshed = await refreshAccessToken(t.refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await saveTokens({
    realmId: t.realmId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? t.refreshToken,
    expiresAt: newExpiresAt,
  });

  return { accessToken: refreshed.access_token, realmId: t.realmId };
}

export function qboApiBase() {
  const env = process.env.QBO_ENV === "production" ? "production" : "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

