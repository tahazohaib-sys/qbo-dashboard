import { NextResponse } from "next/server";
import { AUTH_COOKIE, sessionCookieOptions } from "@/lib/auth";

/**
 * Clears the session. A browser form post (Accept: text/html) is sent to /login,
 * so the Logout button works even before the page scripts have loaded.
 */
export async function POST(req: Request) {
  const wantsPage = (req.headers.get("accept") ?? "").includes("text/html");
  const res = wantsPage ? NextResponse.redirect(new URL("/login", req.url), 303) : NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", sessionCookieOptions(0));
  return res;
}
