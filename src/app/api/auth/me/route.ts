import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved") return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({ ok: true, user: { email: user.email } });
}
