"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="p-4 bg-red-50 rounded-full mb-4">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-[#0b2345] mb-2">حدث خطأ في تحميل الصفحة</h2>
      <p className="text-sm text-[#64748b] mb-6 max-w-sm">
        {error.message || "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى."}
      </p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </div>
  );
}
