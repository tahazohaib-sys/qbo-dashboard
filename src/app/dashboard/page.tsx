import dynamic from "next/dynamic";
import Link from "next/link";
import { getCurrentSession, isAdminEmail } from "@/lib/auth";
import { findUserById } from "@/lib/auth-db";

const DashboardPageClient = dynamic(() => import("@/components/pages/DashboardPageClient"), {
  loading: () => (
    <main className="min-h-screen bg-[#050814] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-[1400px] animate-pulse space-y-4">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-24 rounded-2xl bg-white/10" />
          <div className="h-24 rounded-2xl bg-white/10" />
          <div className="h-24 rounded-2xl bg-white/10" />
        </div>
        <div className="h-80 rounded-2xl bg-white/10" />
      </div>
    </main>
  ),
});

export default async function DashboardPage() {
  const session = await getCurrentSession();
  const user = session ? await findUserById(session.sub) : null;
  const isAdmin = Boolean(user?.status === "approved" && isAdminEmail(user.email));

  return (
    <>
      {isAdmin ? (
        <Link
          href="/admin/access"
          className="fixed right-5 top-5 z-50 rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-2.5 text-sm font-bold text-emerald-50 shadow-[0_18px_42px_rgba(16,185,129,0.22)] backdrop-blur-xl transition hover:bg-emerald-400/22 active:scale-[0.99]"
        >
          Manage Access
        </Link>
      ) : null}
      <DashboardPageClient />
    </>
  );
}
