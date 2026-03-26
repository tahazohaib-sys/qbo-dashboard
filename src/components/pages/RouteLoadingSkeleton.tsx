type RouteLoadingSkeletonProps = {
  cardsGridClassName: string;
};

export default function RouteLoadingSkeleton({ cardsGridClassName }: RouteLoadingSkeletonProps) {
  return (
    <main className="min-h-screen bg-[#050814] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-[1400px] animate-pulse space-y-4">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className={cardsGridClassName}>
          <div className="h-24 rounded-2xl bg-white/10" />
          <div className="h-24 rounded-2xl bg-white/10" />
          <div className="h-24 rounded-2xl bg-white/10" />
        </div>
        <div className="h-80 rounded-2xl bg-white/10" />
      </div>
    </main>
  );
}
