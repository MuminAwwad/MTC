import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: { value: number; label?: string };
  iconColor?: string;
  iconBg?: string;
  className?: string;
  loading?: boolean;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  iconColor = "text-[#104e98]",
  iconBg = "bg-[#e8f0fc]",
  className,
  loading,
}: StatCardProps) {
  if (loading) {
    return (
      <div className={cn("bg-white rounded-xl border border-[#e2e8f0] p-5", className)}>
        <div className="flex items-start justify-between">
          <div className="skeleton h-10 w-10 rounded-lg" />
          <div className="skeleton h-4 w-12 rounded" />
        </div>
        <div className="mt-4 skeleton h-8 w-24 rounded" />
        <div className="mt-1 skeleton h-4 w-32 rounded" />
      </div>
    );
  }

  const isPositive = trend && trend.value >= 0;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#e2e8f0] p-5 hover:shadow-md transition-shadow",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("p-2.5 rounded-lg", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5",
              isPositive
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold text-[#0b2345]">{value}</div>
        <div className="text-sm text-[#64748b] mt-0.5">{label}</div>
        {trend?.label && (
          <div className="text-xs text-[#94a3b8] mt-0.5">{trend.label}</div>
        )}
      </div>
    </div>
  );
}
