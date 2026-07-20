import { redirect } from "next/navigation";
import AdminAccessClient from "./AdminAccessClient";
import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById, listDashboardAccessUsers } from "@/lib/auth-db";

function serializeUser(user: Awaited<ReturnType<typeof listDashboardAccessUsers>>[number]) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    isAdmin: isAdminEmail(user.email),
    hasPassword: Boolean(user.password_hash),
    emailVerifiedAt: user.email_verified_at?.toISOString() ?? null,
    approvedAt: user.approved_at?.toISOString() ?? null,
    rejectedAt: user.rejected_at?.toISOString() ?? null,
    createdAt: user.created_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
  };
}

export default async function AdminAccessPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login?next=/admin/access");

  const user = await findUserById(session.sub);
  if (!user || user.status !== "approved") redirect("/login?next=/admin/access");
  if (!isAdminEmail(user.email)) redirect("/dashboard");

  const users = await listDashboardAccessUsers();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(900px_620px_at_8%_-8%,rgba(0,114,188,0.26),transparent_62%),radial-gradient(760px_520px_at_92%_10%,rgba(16,185,129,0.16),transparent_58%),linear-gradient(135deg,#07152b_0%,#050914_48%,#081321_100%)] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute -inset-12 opacity-[0.052] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:38px_38px]" />
      <section className="relative z-10 mx-auto w-full max-w-6xl">
        <AdminAccessClient initialUsers={users.map(serializeUser)} />
      </section>
    </main>
  );
}
