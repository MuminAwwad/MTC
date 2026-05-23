"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui";
import {
  LayoutDashboard,
  FileText,
  Package,
  Wrench,
  Users,
  Truck,
  CreditCard,
  Receipt,
  BarChart3,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Menu,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
  },
  {
    href: "/invoices",
    label: "الفواتير",
    icon: FileText,
  },
  {
    href: "/inventory",
    label: "المخزون",
    icon: Package,
  },
  {
    href: "/maintenance",
    label: "الصيانة",
    icon: Wrench,
  },
  {
    href: "/customers",
    label: "العملاء",
    icon: Users,
  },
  {
    href: "/suppliers",
    label: "الموردون",
    icon: Truck,
  },
  {
    href: "/debts",
    label: "الديون",
    icon: CreditCard,
  },
  {
    href: "/expenses",
    label: "المصروفات",
    icon: Receipt,
  },
  {
    href: "/reports",
    label: "التقارير",
    icon: BarChart3,
  },
  {
    href: "/chat",
    label: "المساعد الذكي",
    icon: Sparkles,
  },
  {
    href: "/settings",
    label: "الإعدادات",
    icon: Settings,
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const NavContent = () => (
    <>
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-white/10",
          sidebarCollapsed && "justify-center px-2"
        )}
      >
        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white">
          <Image src="/logo-avatar.png" alt="MTC" width={36} height={36} className="w-full h-full object-cover" />
        </div>
        {!sidebarCollapsed && (
          <div>
            <div className="text-white font-bold text-sm leading-tight">
              MTC Electronics
            </div>
            <div className="text-white/50 text-xs">نظام إدارة الأعمال</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                    isActive
                      ? "bg-white/20 text-white font-medium"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                    sidebarCollapsed && "justify-center px-2"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-4.5 w-4.5 flex-shrink-0" size={18} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {isActive && !sidebarCollapsed && (
                    <div className="mr-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-t border-white/10">
          <div className="text-xs text-white/40 text-center">
            MTC Electronics © 2024
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-screen sticky top-0 bg-gradient-to-b from-[#0b2345] to-[#104e98] transition-all duration-300 z-30",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="absolute -left-3 top-20 w-6 h-6 bg-white border border-[#e2e8f0] rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-10"
        >
          {sidebarCollapsed ? (
            <ChevronLeft className="h-3 w-3 text-[#64748b]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[#64748b]" />
          )}
        </button>
        <NavContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          "lg:hidden fixed top-0 right-0 h-full w-72 bg-gradient-to-b from-[#0b2345] to-[#104e98] z-50 flex flex-col transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <button
          onClick={onMobileClose}
          className="absolute left-4 top-4 text-white/70 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <NavContent />
      </aside>
    </>
  );
}
