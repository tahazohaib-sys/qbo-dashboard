import dynamic from "next/dynamic";

const DashboardPageClient = dynamic(
  () => import("@/components/pages/DashboardPageClient"),
  {
    loading: () => (
      <main className="min-h-screen bg-[#050814] text-slate-100 px-4 py-6 md:px-8">
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
  }
);

export default function DashboardPage() {
  return <DashboardPageClient />;
}
