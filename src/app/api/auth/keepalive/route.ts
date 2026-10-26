import { NextResponse } from "next/server";

/**
 * Called by the page when the user is active. proxy.ts checks the session and
 * issues a new token, so the idle timer starts again. Reading the dashboard
 * without new data requests still counts as activity.
 */
export async function POST() {
  return NextResponse.json({ ok: true });
}
