import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]" dir="rtl">
      <div className="text-center px-4">
        <div className="text-8xl font-bold text-[#e2e8f0] mb-4">404</div>
        <h1 className="text-2xl font-bold text-[#0b2345] mb-2">الصفحة غير موجودة</h1>
        <p className="text-[#64748b] mb-6">الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#104e98] text-white rounded-xl text-sm font-medium hover:bg-[#0b3d7a] transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
