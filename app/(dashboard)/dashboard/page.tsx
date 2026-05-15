import { Suspense } from "react";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { RecentInvoices } from "@/components/dashboard/RecentInvoices";
import { RecentTickets } from "@/components/dashboard/RecentTickets";
import { CardSkeleton, LoadingSkeleton } from "@/components/shared";

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
