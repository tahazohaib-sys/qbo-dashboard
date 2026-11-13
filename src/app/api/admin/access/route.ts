import { NextResponse } from "next/server";
import { getBaseUrl, getCurrentSession, isAdminEmail } from "@/lib/auth";
import { sendAccessEmail } from "@/lib/access-emails";
import { accessLevelOf, findUserById, listDashboardAccessUsers, setDashboardUserStatus, setUserAccessLevel, type AccessLevel } from "@/lib/auth-db";

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
    accessLevel: accessLevelOf(user),
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

    const baseUrl = getBaseUrl(req);
    const isLevel = (v: unknown): v is AccessLevel => v === "all" || v === "all_costing" || v === "costing_only";
    const reply = async (updated: NonNullable<Awaited<ReturnType<typeof setUserAccessLevel>>>, email?: { sent: boolean; error?: string }) => {
      const nextUsers = await listDashboardAccessUsers();
      const emailNotice = !email
        ? undefined
        : email.sent
          ? `Email sent to ${updated.email}.`
          : `Saved, but the email to ${updated.email} could not be sent: ${email.error}`;
      return NextResponse.json({ ok: true, user: serializeUser(updated), users: nextUsers.map(serializeUser), emailSent: email?.sent, emailNotice });
    };

    if (action === "set_access") {
      const level = body?.level;
      if (!isLevel(level)) return NextResponse.json({ ok: false, error: "Invalid access level." }, { status: 400 });
      const before = accessLevelOf(target);
      const updated = await setUserAccessLevel(userId, level);
      if (!updated) return NextResponse.json({ ok: false, error: "Could not update this user." }, { status: 500 });
      // Tell an approved user what they can open now.
      const email =
        updated.status === "approved" && before !== level
          ? await sendAccessEmail({ kind: "updated", email: updated.email, level, baseUrl })
          : undefined;
      return reply(updated, email);
    }

    const nextStatus = action === "approve" ? "approved" : action === "revoke" || action === "reject" ? "rejected" : null;
    if (!nextStatus) return NextResponse.json({ ok: false, error: "Invalid admin action." }, { status: 400 });

    // On approve, the admin can choose the access level at the same time, so the email names the right modules.
    if (nextStatus === "approved" && isLevel(body?.level)) await setUserAccessLevel(userId, body.level);

    const wasApproved = target.status === "approved";
    const updated = await setDashboardUserStatus(userId, nextStatus);
    if (!updated) return NextResponse.json({ ok: false, error: "Could not update this user." }, { status: 500 });

    let email: { sent: boolean; error?: string } | undefined;
    if (nextStatus === "approved" && !wasApproved) {
      email = await sendAccessEmail({ kind: "approved", email: updated.email, level: accessLevelOf(updated), baseUrl });
    } else if (nextStatus === "rejected" && target.status !== "rejected") {
      email = await sendAccessEmail({ kind: wasApproved ? "revoked" : "rejected", email: updated.email, level: accessLevelOf(updated), baseUrl });
    }
    return reply(updated, email);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Admin action failed." }, { status: 500 });
  }
}
