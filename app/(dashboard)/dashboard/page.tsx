import { Suspense } from "react";
import dynamic from "next/dynamic";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { RecentInvoices } from "@/components/dashboard/RecentInvoices";
import { RecentTickets } from "@/components/dashboard/RecentTickets";
import { CardSkeleton, LoadingSkeleton } from "@/components/shared";

// recharts is the heaviest client dependency on this route; loading it in
// its own chunk lets the stats and tables become interactive without
// waiting for the chart bundle.
const DashboardCharts = dynamic(
  () =>
    import("@/components/dashboard/DashboardCharts").then(
      (m) => m.DashboardCharts
    ),
  { loading: () => <div className="skeleton h-64 rounded-xl" /> }
);

export const metadata = { title: "لوحة التحكم - MTC Electronics" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <Suspense fallback={<CardSkeleton count={4} />}>
        <DashboardStats />
      </Suspense>

      {/* Charts */}
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <DashboardCharts />
      </Suspense>

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
          <RecentInvoices />
        </Suspense>
        <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
          <RecentTickets />
        </Suspense>
      </div>
    </div>
  );
}
