import { NextResponse } from "next/server";
import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById, listDashboardAccessUsers, setDashboardUserStatus } from "@/lib/auth-db";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) return null;

  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved" || !isAdminEmail(user.email)) return null;
  return user;
}

function serializeUser(user: Awaited<ReturnType<typeof listDashboardAccessUsers>>[number]) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    isAdmin: isAdminEmail(user.email),
    hasPassword: Boolean(user.password_hash),
    emailVerifiedAt: user.email_verified_at,
    approvedAt: user.approved_at,
    rejectedAt: user.rejected_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });

  const users = await listDashboardAccessUsers();
  return NextResponse.json({ ok: true, users: users.map(serializeUser) });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "Admin access required." }, { status: 403 });

  try {
    const body = await req.json();
    const userId = String(body?.userId ?? "");
    const action = String(body?.action ?? "");

    const users = await listDashboardAccessUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    if (isAdminEmail(target.email)) {
      return NextResponse.json({ ok: false, error: "Admin access cannot be revoked here." }, { status: 400 });
    }

    const nextStatus = action === "approve" ? "approved" : action === "revoke" || action === "reject" ? "rejected" : null;
    if (!nextStatus) return NextResponse.json({ ok: false, error: "Invalid admin action." }, { status: 400 });

    const updated = await setDashboardUserStatus(userId, nextStatus);
    if (!updated) return NextResponse.json({ ok: false, error: "Could not update this user." }, { status: 500 });

    const nextUsers = await listDashboardAccessUsers();
    return NextResponse.json({ ok: true, user: serializeUser(updated), users: nextUsers.map(serializeUser) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Admin action failed." }, { status: 500 });
  }
}
