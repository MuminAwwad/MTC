import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}

export function PageHeader({ title, subtitle, action, breadcrumb, className }: PageHeaderProps) {
  // On mobile a long breadcrumb chain pushes the title onto two lines. Show
  // only the last 2 levels (typically "section / current") on small screens
  // and the full chain from sm: upward.
  const mobileCrumb =
    breadcrumb && breadcrumb.length > 2 ? breadcrumb.slice(-2) : breadcrumb;

  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <>
          {/* Mobile crumb (truncated) */}
          <nav className="sm:hidden flex items-center gap-1.5 text-xs text-[#64748b] mb-2">
            {mobileCrumb!.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span>/</span>}
                {item.href ? (
                  <a href={item.href} className="hover:text-[#104e98] transition-colors">
                    {item.label}
                  </a>
                ) : (
                  <span className="text-[#1e293b] truncate max-w-[180px]">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
          {/* Desktop crumb (full) */}
          <nav className="hidden sm:flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[#64748b] mb-2">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span>/</span>}
                {item.href ? (
                  <a href={item.href} className="hover:text-[#104e98] transition-colors">
                    {item.label}
                  </a>
                ) : (
                  <span className={i === breadcrumb.length - 1 ? "text-[#1e293b]" : ""}>
                    {item.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        </>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0b2345] break-words">{title}</h1>
          {/* Subtitle hidden on mobile to free up vertical space — typically
              just a record count or timestamp the user can find elsewhere. */}
          {subtitle && (
            <p className="hidden sm:block text-sm text-[#64748b] mt-1 break-words">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="sm:flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
