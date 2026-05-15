"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) { setError("الاسم مطلوب"); return; }
    if (!form.email) { setError("البريد الإلكتروني مطلوب"); return; }
    if (form.password.length < 6) { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (form.password !== form.confirmPassword) { setError("كلمتا المرور غير متطابقتين"); return; }

    setLoading(true);
    try {
      const supabase = createClient();

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError("هذا البريد الإلكتروني مسجل مسبقًا");
        } else {
          setError(signUpError.message || "حدث خطأ أثناء إنشاء الحساب");
        }
        return;
      }

      if (data.user) {
        await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.user.id, name: form.name, email: form.email }),
        });
      }

      setConfirmed(true);
    } catch {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مجددًا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b2345] to-[#104e98] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {confirmed ? (
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-[#0b2345] mb-2">تحقق من بريدك الإلكتروني</h2>
            <p className="text-sm text-[#64748b] mb-6">
              تم إرسال رابط التأكيد إلى <span className="font-medium text-[#0b2345]">{form.email}</span>.<br />
              افتح الرابط لتفعيل حسابك ثم سجّل الدخول.
            </p>
            <Link href="/login" className="inline-block w-full h-11 leading-[2.75rem] text-center bg-[#0b2345] text-white rounded-lg text-sm font-medium hover:bg-[#104e98] transition-colors">
              الذهاب إلى تسجيل الدخول
            </Link>
          </div>
        ) : (
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <Image src="/logo-avatar.png" alt="MTC Electronics" width={100} height={100} className="mx-auto mb-3" priority />
            <h1 className="text-xl font-bold text-[#0b2345]">إنشاء حساب جديد</h1>
            <p className="text-sm text-[#64748b] mt-1">نظام إدارة الأعمال</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <FormField label="الاسم الكامل" htmlFor="name">
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  id="name"
                  placeholder="محمد أحمد"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="pr-10"
                  autoFocus
                />
              </div>
            </FormField>

            <FormField label="البريد الإلكتروني" htmlFor="email">
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
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
                  placeholder="6 أحرف على الأقل"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  className="pr-10 pl-10"
                  dir="ltr"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>

            <FormField label="تأكيد كلمة المرور" htmlFor="confirmPassword">
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="أعد كتابة كلمة المرور"
                  value={form.confirmPassword}
                  onChange={(e) => set("confirmPassword", e.target.value)}
                  className="pr-10"
                  dir="ltr"
                  autoComplete="new-password"
                />
              </div>
            </FormField>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري إنشاء الحساب...
                </div>
              ) : (
                "إنشاء الحساب"
              )}
            </Button>
          </form>

          <p className="text-sm text-center text-[#64748b] mt-6">
            لديك حساب؟{" "}
            <Link href="/login" className="text-[#104e98] font-medium hover:underline">
              تسجيل الدخول
            </Link>
          </p>

          <p className="text-xs text-[#94a3b8] text-center mt-3">
            نابلس، فلسطين | 0599880618
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
