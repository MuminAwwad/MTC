import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PackageOpen } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div className="p-4 bg-[#f1f5f9] rounded-full mb-4">
        <Icon className="h-8 w-8 text-[#94a3b8]" />
      </div>
      <h3 className="text-base font-semibold text-[#1e293b] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[#64748b] max-w-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4" size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
