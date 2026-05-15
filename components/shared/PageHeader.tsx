import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}

export function PageHeader({ title, subtitle, action, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 text-sm text-[#64748b] mb-2">
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
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0b2345]">{title}</h1>
          {subtitle && <p className="text-sm text-[#64748b] mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
