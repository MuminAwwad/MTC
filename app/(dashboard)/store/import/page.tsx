import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/shared";

export default function StoreImportPage() {
  return (
    <EmptyState
      icon={RefreshCw}
      title="قيد الإنشاء"
      description="المزامنة اليدوية واستيراد الملفات وسجل العمليات ستتوفر هنا قريباً."
    />
  );
}
