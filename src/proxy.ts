import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSessionToken,
  isAdminEmail,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  shouldRefreshSession,
  verifySessionToken,
} from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

/**
 * Access control for the dashboard and its APIs.
 *
 * Next.js 16 runs proxy.ts on the Node.js runtime, so every protected request
 * checks both the signed session cookie and the user's current status in the
 * database. A revoked or rejected user loses access at once, not when the
 * cookie expires. Each allowed request extends the session, so it ends after
 * 2 hours with no activity. The check fails closed: no valid session, an unknown
 * user, a non-approved status or a database error all deny access.
 */

type Session = NonNullable<ReturnType<typeof verifySessionToken>>;
type Access = { ok: true; isAdmin: boolean; session: Session } | { ok: false };

async function checkAccess(req: NextRequest): Promise<Access> {
  try {
    const session = verifySessionToken(req.cookies.get(AUTH_COOKIE)?.value);
    if (!session) return { ok: false };
    const user = await findUserById(session.sub);
    if (!user || user.status !== "approved") return { ok: false };
    return { ok: true, isAdmin: isAdminEmail(user.email), session };
  } catch {
    return { ok: false };
  }
}

function isProtectedApi(pathname: string) {
  return (
    pathname === "/api/dashboard" ||
    pathname === "/api/forecast" ||
    pathname === "/api/fx-rate" ||
    pathname === "/api/revenue-analytics" ||
    pathname.startsWith("/api/ai/") ||
    pathname.startsWith("/api/custom-fields/") ||
    pathname === "/api/qbo/pnl-table" ||
    pathname === "/api/qbo/ar-ap" ||
    pathname === "/api/qbo/cash-banks" ||
    pathname === "/api/qbo/account-transactions" ||
    pathname === "/api/qbo/retained-earning" ||
    pathname === "/api/qbo/expense-breakdown" ||
    pathname === "/api/qbo/monthly-cashflow" ||
    pathname === "/api/qbo/debug-balance-sheet" ||
    pathname === "/api/auth/keepalive"
  );
}

/** Connecting QuickBooks replaces the company the whole dashboard reads, so only the admin may do it. */
function isAdminOnlyApi(pathname: string) {
  return pathname === "/api/qbo/start" || pathname === "/api/qbo/callback";
}

/** Lets the request through and, when due, issues a new token so the idle timer starts again. */
function allow(access: Extract<Access, { ok: true }>) {
  const res = NextResponse.next();
  if (shouldRefreshSession(access.session)) {
    const { sub, email } = access.session;
    res.cookies.set(AUTH_COOKIE, createSessionToken({ sub, email, isAdmin: access.isAdmin }), sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const access = await checkAccess(req);
    if (access.ok) return allow(access);
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminOnlyApi(pathname)) {
    const access = await checkAccess(req);
    if (access.ok && access.isAdmin) return allow(access);
    return NextResponse.json({ ok: false, error: "Only the dashboard admin can connect QuickBooks." }, { status: 403 });
  }

  if (isProtectedApi(pathname)) {
    const access = await checkAccess(req);
    if (access.ok) return allow(access);
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
