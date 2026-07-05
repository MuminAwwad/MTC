import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreManualProductForm } from "@/components/store/StoreManualProductForm";

export default function NewStoreProductPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/store/products" aria-label="عودة">
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[#1e293b]">منتج جديد للمتجر</h2>
          <p className="text-sm text-[#64748b]">
            منتج يُنشأ في المتجر مباشرة — لا يرتبط بمخزون نظام الإدارة ولا تلمسه المزامنة.
          </p>
        </div>
      </div>
      <StoreManualProductForm />
    </div>
  );
}
