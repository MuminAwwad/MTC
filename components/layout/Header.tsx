"use client";

import { useState } from "react";
import { Bell, Menu, LogOut, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title?: string;
  userName?: string;
  onMobileMenuOpen?: () => void;
}

export function Header({ title, userName = "المستخدم", onMobileMenuOpen }: HeaderProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-[#e2e8f0] flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMobileMenuOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo on mobile */}
        <div className="lg:hidden flex items-center gap-2">
          <div className="w-7 h-7 bg-[#104e98] rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="font-bold text-[#0b2345] text-sm">MTC Electronics</span>
        </div>
      </div>

      {/* Left side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-[#64748b]" />
          <span className="absolute top-2 left-2 w-2 h-2 bg-[#ef4444] rounded-full" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f8fafc] transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium text-[#1e293b] leading-tight">
                  {userName}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#64748b]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>
              <User className="h-4 w-4 ml-2" />
              الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[#ef4444] focus:text-[#ef4444]"
              onClick={handleSignOut}
              disabled={loading}
            >
              <LogOut className="h-4 w-4 ml-2" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
