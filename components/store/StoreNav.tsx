"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/store", label: "نظرة عامة" },
  { href: "/store/products", label: "المنتجات" },
  { href: "/store/import", label: "المزامنة والاستيراد" },
  { href: "/store/content", label: "محرر الواجهة" },
  { href: "/store/orders", label: "الطلبات" },
];

/** Sub-navigation shared by every page in the store (المتجر) section. */
export function StoreNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-[#e2e8f0] mb-6 overflow-x-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/store"
            ? pathname === "/store"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              active
                ? "border-[#104e98] text-[#104e98]"
                : "border-transparent text-[#64748b] hover:text-[#1e293b] hover:border-[#cbd5e1]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
