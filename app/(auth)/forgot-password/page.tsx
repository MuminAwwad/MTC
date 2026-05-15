"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("يرجى إدخال البريد الإلكتروني"); return; }
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://mtc-livid.vercel.app/reset-password",
      });

      if (resetError) {
        setError("حدث خطأ أثناء إرسال البريد. يرجى المحاولة مجددًا");
      } else {
        setSent(true);
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

          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-[#0b2345] mb-2">تحقق من بريدك</h2>
              <p className="text-sm text-[#64748b] mb-6">
                أرسلنا رابط إعادة تعيين كلمة المرور إلى{" "}
                <span className="font-medium text-[#0b2345]">{email}</span>.<br />
                افتح الرابط لإنشاء كلمة مرور جديدة.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm text-[#104e98] font-medium hover:underline"
              >
                <ArrowRight className="h-4 w-4" />
                العودة إلى تسجيل الدخول
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#0b2345] mb-1">نسيت كلمة المرور؟</h1>
              <p className="text-sm text-[#64748b] mb-6">
                أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                      autoFocus
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
                      جاري الإرسال...
                    </div>
                  ) : "إرسال رابط إعادة التعيين"}
                </Button>
              </form>

              <div className="text-center mt-6">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-[#64748b] hover:text-[#104e98]"
                >
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى تسجيل الدخول
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
