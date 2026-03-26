import dynamic from "next/dynamic";
import RouteLoadingSkeleton from "@/components/pages/RouteLoadingSkeleton";

const RevenueAnalyticsPageClient = dynamic(
  () => import("@/components/pages/RevenueAnalyticsPageClient"),
  {
    loading: () => <RouteLoadingSkeleton cardsGridClassName="grid grid-cols-1 gap-4 lg:grid-cols-3" />,
  }
);

export default function RevenueAnalyticsPage() {
  return <RevenueAnalyticsPageClient />;
}
