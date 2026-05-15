import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
  noPadding,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#e2e8f0] shadow-sm",
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-[#1e293b]">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && "p-5", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
