import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  className?: string;
  rows?: number;
  columns?: number;
}

export function LoadingSkeleton({ className, rows = 5, columns = 4 }: LoadingSkeletonProps) {
  return (
    <div className={cn("animate-pulse", className)}>
      {/* Table header */}
      <div className="flex gap-4 mb-3 px-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 bg-[#e2e8f0] rounded flex-1" />
        ))}
      </div>
      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3 border-t border-[#f1f5f9]"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-5 bg-[#f1f5f9] rounded flex-1"
              style={{ opacity: 1 - i * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-pulse"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 bg-[#e2e8f0] rounded-lg" />
            <div className="h-5 w-12 bg-[#f1f5f9] rounded-full" />
          </div>
          <div className="h-8 w-28 bg-[#e2e8f0] rounded mb-2" />
          <div className="h-4 w-20 bg-[#f1f5f9] rounded" />
        </div>
      ))}
    </div>
  );
}
