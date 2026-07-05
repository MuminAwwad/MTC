import { Database } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/shared";
import { SyncActions } from "@/components/store/SyncActions";
import { getStoreImportRuns } from "@/lib/store/catalog";
import { hasStoreDb } from "@/lib/store/db";
import { formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  "source-db": "مزامنة من نظام الإدارة",
  manual: "مزامنة يدوية",
  scheduled: "مزامنة مجدولة",
  upload: "استيراد ملف",
  cli: "سطر الأوامر",
  "tickets:scheduled": "مزامنة تذاكر (مجدولة)",
};

export default async function StoreImportPage() {
  if (!hasStoreDb()) {
    return (
      <EmptyState
        icon={Database}
        title="قاعدة بيانات المتجر غير مهيأة"
        description="أضف STORE_DATABASE_URL إلى متغيرات البيئة ثم أعد تشغيل التطبيق."
      />
    );
  }

  const runs = await getStoreImportRuns(20);

  return (
    <div className="space-y-6">
      <SyncActions />

      <SectionCard title="سجل العمليات" noPadding>
        {runs.length === 0 ? (
          <p className="text-sm text-[#64748b] p-4">لا توجد عمليات مزامنة أو استيراد بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  {["العملية", "التاريخ", "منتجات", "خيارات", "متخطى", "المدة", "الحالة"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-[#f8fafc]">
                    <td className="px-4 py-3 text-[#1e293b]">
                      {SOURCE_LABELS[run.source] ?? run.source}
                      {run.filename && (
                        <span className="block text-xs text-[#94a3b8] ltr">{run.filename}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#64748b] whitespace-nowrap">
                      {formatDateTime(run.createdAt)}
                    </td>
                    <td className="px-4 py-3">{run.productsUpserted}</td>
                    <td className="px-4 py-3">{run.variantsUpserted}</td>
                    <td className="px-4 py-3">{run.skipped}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">
                      {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          run.status === "ok"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {run.status === "ok" ? "ناجحة" : "فاشلة"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
