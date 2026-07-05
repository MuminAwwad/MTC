import { Palette } from "lucide-react";
import { EmptyState } from "@/components/shared";

export default function StoreContentPage() {
  return (
    <EmptyState
      icon={Palette}
      title="قيد الإنشاء"
      description="محرر واجهة المتجر (الصفحات، الإعدادات العامة، مكتبة الوسائط) سيتوفر هنا قريباً."
    />
  );
}
