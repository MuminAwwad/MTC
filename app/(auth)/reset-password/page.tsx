"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import Image from "next/image";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("رابط إعادة التعيين غير صالح أو منتهي الصلاحية");
      setVerifying(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setError("رابط إعادة التعيين غير صالح أو منتهي الصلاحية");
      } else {
        setSessionReady(true);
      }
      setVerifying(false);
    });
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (password !== confirmPassword) { setError("كلمتا المرور غير متطابقتين"); return; }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("حدث خطأ أثناء تحديث كلمة المرور. يرجى المحاولة مجددًا");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مجددًا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b2345] to-[#104e98] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <Image src="/logo-avatar.png" alt="MTC Electronics" width={100} height={100} className="mx-auto mb-3" priority />
          </div>

          {verifying ? (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-2 border-[#104e98]/30 border-t-[#104e98] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#64748b]">جاري التحقق من الرابط...</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-[#0b2345] mb-2">تم تغيير كلمة المرور</h2>
              <p className="text-sm text-[#64748b]">سيتم تحويلك إلى صفحة تسجيل الدخول...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-[#0b2345] mb-2">رابط غير صالح</h2>
              <p className="text-sm text-[#64748b] mb-6">{error}</p>
              <Link href="/forgot-password" className="text-sm text-[#104e98] font-medium hover:underline">
                طلب رابط جديد
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#0b2345] mb-1">إعادة تعيين كلمة المرور</h1>
              <p className="text-sm text-[#64748b] mb-6">أدخل كلمة المرور الجديدة</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="كلمة المرور الجديدة" htmlFor="new-password">
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="6 أحرف على الأقل"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 pl-10"
                      dir="ltr"
                      autoFocus
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

                <FormField label="تأكيد كلمة المرور" htmlFor="confirm-password">
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="أعد كتابة كلمة المرور"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pr-10"
                      dir="ltr"
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
                      جاري الحفظ...
                    </div>
                  ) : "تعيين كلمة المرور الجديدة"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
