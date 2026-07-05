"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/shared/Toast";
import type { ProductStatus } from "@/lib/store/types";

/** Quick publish / unpublish / archive buttons for a store product row. */
export function ProductStatusActions({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState<ProductStatus | null>(null);

  const setStatus = async (next: ProductStatus) => {
    setLoading(next);
    try {
      const res = await fetch(`/api/store/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "تعذّر تحديث الحالة", "error");
      } else {
        toast(
          next === "published"
            ? "تم النشر — أصبح المنتج ظاهراً للعملاء"
            : next === "archived"
            ? "تمت الأرشفة"
            : "أصبح المنتج مسودة مخفية"
        );
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {status !== "published" && (
        <Button
          size="sm"
          variant="outline"
          className="text-green-700 border-green-200 hover:bg-green-50"
          disabled={loading !== null}
          onClick={() => setStatus("published")}
        >
          <Eye className="h-3.5 w-3.5" />
          {loading === "published" ? "جارٍ النشر..." : "نشر"}
        </Button>
      )}
      {status === "published" && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading !== null}
          onClick={() => setStatus("draft")}
        >
          <EyeOff className="h-3.5 w-3.5" />
          {loading === "draft" ? "..." : "إخفاء"}
        </Button>
      )}
      {status !== "archived" && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-[#64748b]"
          disabled={loading !== null}
          onClick={() => setStatus("archived")}
          aria-label="أرشفة"
          title="أرشفة"
        >
          <Archive className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
