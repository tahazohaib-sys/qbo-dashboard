import dynamic from "next/dynamic";
import RouteLoadingSkeleton from "@/components/pages/RouteLoadingSkeleton";

const DashboardPageClient = dynamic(
  () => import("@/components/pages/DashboardPageClient"),
  {
    loading: () => <RouteLoadingSkeleton cardsGridClassName="grid grid-cols-1 gap-4 md:grid-cols-3" />,
  }
);

export default function DashboardPage() {
  return <DashboardPageClient />;
}
