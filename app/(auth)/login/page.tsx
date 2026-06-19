"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { writeRememberCookie } from "@/lib/supabase/cookie-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Shown when the user was redirected here by the inactivity auto-logout.
  // useSyncExternalStore keeps this SSR-safe: the server renders nothing and the
  // client reads the URL after hydration without a mismatch.
  const idleNotice = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("reason") === "idle",
    () => false
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Persist the choice before sign-in so the auth cookies Supabase writes
      // inherit the right lifetime (persistent vs. session cookie).
      writeRememberCookie(remember);
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("يرجى تأكيد بريدك الإلكتروني أولاً، أو تواصل مع المسؤول لتفعيل الحساب");
        } else {
          setError(authError.message);
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مجددًا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b2345] to-[#104e98] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Image src="/logo-avatar.png" alt="MTC Electronics" width={120} height={120} className="mx-auto mb-3" priority />
            <p className="text-sm text-[#64748b]">نظام إدارة الأعمال</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <FormField label="البريد الإلكتروني" htmlFor="email">
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10"
                  dir="ltr"
                  autoComplete="email"
                />
              </div>
            </FormField>

            <FormField label="كلمة المرور" htmlFor="password">
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 pl-10"
                  dir="ltr"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </FormField>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-[#64748b] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] accent-[#104e98] cursor-pointer"
                />
                تذكرني
              </label>
              <Link href="/forgot-password" className="text-xs text-[#64748b] hover:text-[#104e98]">
                نسيت كلمة المرور؟
              </Link>
            </div>

            {idleNotice && !error && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                تم تسجيل خروجك تلقائيًا بسبب عدم النشاط. يرجى تسجيل الدخول مجددًا
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري تسجيل الدخول...
                </div>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>

          <p className="text-sm text-center text-[#64748b] mt-6">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="text-[#104e98] font-medium hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>

          {/* Footer */}
          <p className="text-xs text-[#94a3b8] text-center mt-3">
            نابلس، فلسطين | 0599880618
          </p>
        </div>
      </div>
    </div>
  );
}
