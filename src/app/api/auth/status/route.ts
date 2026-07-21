import { NextResponse } from "next/server";
import { findUserByAuthToken } from "@/lib/auth-db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    const user = await findUserByAuthToken(token, "access_status");

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "This status link is invalid or expired." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, status: user.status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Could not check approval status." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
