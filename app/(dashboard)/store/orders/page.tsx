import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/shared";

// Orders aren't stored yet — the store has no orders/payments system.
// This tab shows an empty state until an order source is connected.
export default function StoreOrdersPage() {
  return (
    <EmptyState
      icon={Receipt}
      title="لا توجد طلبات بعد"
      description="لم يتم ربط نظام طلبات أو مدفوعات بالمتجر بعد. ستظهر الطلبات هنا تلقائياً بمجرد توفّر مصدر بيانات الطلبات."
    />
  );
}
