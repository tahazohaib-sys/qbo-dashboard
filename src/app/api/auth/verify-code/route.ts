import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Email-code access requests are no longer used. Request access with email only, then wait for approval.",
    },
    { status: 410 }
  );
}
