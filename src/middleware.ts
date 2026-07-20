import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "qbo_dashboard_session";

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token || !token.includes(".")) return false;

  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-qbo-dashboard-auth-secret");
  if (!secret) return false;

  const expected = await hmacSha256(body, secret);
  if (expected !== signature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    return Boolean(payload?.sub && payload?.email && payload?.exp && payload.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

function isProtectedApi(pathname: string) {
  return (
    pathname === "/api/dashboard" ||
    pathname === "/api/forecast" ||
    pathname === "/api/revenue-analytics" ||
    pathname.startsWith("/api/ai/") ||
    pathname.startsWith("/api/custom-fields/") ||
    pathname === "/api/qbo/pnl-table" ||
    pathname === "/api/qbo/pnl-monthly" ||
    pathname === "/api/qbo/ar-ap" ||
    pathname === "/api/qbo/cash-banks" ||
    pathname === "/api/qbo/account-transactions" ||
    pathname === "/api/qbo/retained-earning" ||
    pathname === "/api/qbo/debug-balance-sheet"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const valid = await hasValidSession(req);

  if (pathname.startsWith("/dashboard")) {
    if (valid) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isProtectedApi(pathname)) {
    if (valid) return NextResponse.next();
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
