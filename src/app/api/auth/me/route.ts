import { NextResponse } from "next/server";
import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved") return NextResponse.json({ ok: false }, { status: 401 });

  const isAdmin = Boolean(session.isAdmin || isAdminEmail(user.email));
  return NextResponse.json({ ok: true, user: { email: user.email, isAdmin } });
}
