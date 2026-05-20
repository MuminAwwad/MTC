"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]" dir="rtl">
      <div className="text-center px-4">
        <div className="inline-flex p-4 bg-red-50 rounded-full mb-4">
          <AlertTriangle className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-[#0b2345] mb-2">حدث خطأ غير متوقع</h1>
        <p className="text-[#64748b] mb-6 max-w-sm mx-auto">
          {error.message || "حدث خطأ في تحميل هذه الصفحة. يرجى المحاولة مرة أخرى."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-[#104e98] text-white rounded-xl text-sm font-medium hover:bg-[#0b3d7a] transition-colors"
          >
            إعادة المحاولة
          </button>
          <a
            href="/dashboard"
            className="px-5 py-2.5 border border-[#e2e8f0] text-[#1e293b] rounded-xl text-sm font-medium hover:bg-[#f8fafc] transition-colors"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}
