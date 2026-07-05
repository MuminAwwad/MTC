"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import type { ImportReport } from "@/lib/store/sync";

function ReportSummary({ report }: { report: ImportReport }) {
  if (!report.ok) {
    return <p className="text-sm text-red-600">{report.message ?? "فشلت العملية"}</p>;
  }
  return (
    <div className="text-sm text-[#1e293b] space-y-1">
      <p className="font-medium text-green-700">تمت المزامنة بنجاح ✓</p>
      <p className="text-[#64748b]">
        {report.productsUpserted} منتج محدّث · {report.variantsUpserted} خيار ·{" "}
        {report.imagesUpserted} صورة · {report.deactivated} أُلغي تفعيله ·{" "}
        {report.skipped} تم تخطيه · {(report.durationMs / 1000).toFixed(1)} ثانية
      </p>
      {report.errors.length > 0 && (
        <details className="text-xs text-[#94a3b8]">
          <summary className="cursor-pointer">تفاصيل الصفوف المتخطاة ({report.errors.length})</summary>
          <ul className="mt-1 space-y-0.5 list-disc pr-4">
            {report.errors.slice(0, 10).map((e, i) => (
              <li key={i}>
                {e.name ?? e.externalId ?? "صف"}: {e.issues.join("، ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SyncActions() {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function runSync() {
    setSyncing(true);
    setReport(null);
    try {
      const res = await fetch("/api/store/sync", { method: "POST" });
      const data = (await res.json()) as ImportReport & { error?: string };
      if (data.error) {
        toast(data.error, "error");
      } else {
        setReport(data);
        if (data.ok) toast("تمت المزامنة");
        else toast(data.message ?? "فشلت المزامنة", "error");
        router.refresh();
      }
    } catch {
      toast("تعذّر الاتصال بالخادم", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setReport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/store/import", { method: "POST", body: form });
      const data = (await res.json()) as ImportReport & { error?: string };
      if (data.error) {
        toast(data.error, "error");
      } else {
        setReport(data);
        if (data.ok) toast("تم الاستيراد");
        else toast(data.message ?? "فشل الاستيراد", "error");
        router.refresh();
      }
    } catch {
      toast("تعذّر الاتصال بالخادم", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SectionCard title="مزامنة من نظام الإدارة">
        <p className="text-sm text-[#64748b] mb-4">
          يقرأ منتجات المخزون في هذا النظام ويحدّث كتالوج المتجر: المنتجات الجديدة تصل
          كمسودات، وتعديلاتك (النشر واللمسات النهائية) تبقى محفوظة. المنتجات المحذوفة من
          المخزون يُلغى تفعيلها في المتجر.
        </p>
        <Button onClick={runSync} disabled={syncing || uploading}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "جارٍ المزامنة..." : "مزامنة الآن"}
        </Button>
      </SectionCard>

      <SectionCard title="استيراد من ملف">
        <p className="text-sm text-[#64748b] mb-4">
          استيراد منتجات من ملف CSV أو Excel أو JSON (بحد أقصى 10MB). الأعمدة تُطابَق
          تلقائياً بأسمائها الشائعة (name، price، stock، category…).
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          className="hidden"
          onChange={(e) => onFile(e.target.files)}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={syncing || uploading}>
          <Upload className="h-4 w-4" />
          {uploading ? "جارٍ الاستيراد..." : "اختيار ملف"}
        </Button>
      </SectionCard>

      {report && (
        <div className="lg:col-span-2">
          <SectionCard title="نتيجة آخر عملية">
            <ReportSummary report={report} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
