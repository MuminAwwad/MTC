/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Plus, ShoppingBag, Pencil, Zap, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, EmptyState, CurrencyDisplay } from "@/components/shared";
import { ProductStatusActions } from "@/components/store/ProductStatusActions";
import { getStoreAdminProducts, type StoreAdminProduct } from "@/lib/store/catalog";
import { hasStoreDb } from "@/lib/store/db";
import { cn } from "@/lib/utils";
import type { ProductStatus } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const STATUS_TABS: Array<{ value: ProductStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "draft", label: "مسودة" },
  { value: "published", label: "منشور" },
  { value: "archived", label: "مؤرشف" },
];

const STATUS_BADGE: Record<ProductStatus, { label: string; cls: string }> = {
  published: { label: "منشور", cls: "bg-green-100 text-green-700" },
  draft: { label: "مسودة", cls: "bg-yellow-100 text-yellow-700" },
  archived: { label: "مؤرشف", cls: "bg-gray-100 text-gray-600" },
};

const STOCK_TONE: Record<string, string> = {
  in: "text-[#16a34a]",
  low: "text-[#d97706]",
  out: "text-red-600",
};

function Thumb({ p }: { p: StoreAdminProduct }) {
  if (p.image) {
    return (
      <img
        src={p.image}
        alt={p.name}
        className="h-10 w-10 rounded-lg object-cover border border-[#e2e8f0] bg-white"
      />
    );
  }
  return (
    <span className="h-10 w-10 rounded-lg bg-[#e8f0fc] text-[#104e98] flex items-center justify-center">
      {p.kind === "digital" ? <Zap className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
    </span>
  );
}

export default async function StoreProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  if (!hasStoreDb()) {
    return (
      <EmptyState
        icon={Database}
        title="قاعدة بيانات المتجر غير مهيأة"
        description="أضف STORE_DATABASE_URL إلى متغيرات البيئة ثم أعد تشغيل التطبيق."
      />
    );
  }

  const { status = "", q = "" } = await searchParams;
  const all = await getStoreAdminProducts();

  const counts = {
    "": all.length,
    draft: all.filter((p) => p.status === "draft").length,
    published: all.filter((p) => p.status === "published").length,
    archived: all.filter((p) => p.status === "archived").length,
  };

  const search = q.trim().toLowerCase();
  const products = all.filter(
    (p) =>
      (!status || p.status === status) &&
      (!search ||
        p.name.toLowerCase().includes(search) ||
        p.externalId.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status filter tabs (server-rendered links keep the page a server component) */}
        <div className="flex gap-1 bg-[#f1f5f9] rounded-lg p-1">
          {STATUS_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={tab.value ? `/store/products?status=${tab.value}` : "/store/products"}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                status === tab.value
                  ? "bg-white text-[#104e98] shadow-sm"
                  : "text-[#64748b] hover:text-[#1e293b]"
              )}
            >
              {tab.label} ({counts[tab.value as keyof typeof counts]})
            </Link>
          ))}
        </div>
        <Button asChild size="sm">
          <Link href="/store/products/new">
            <Plus className="h-4 w-4" />
            منتج جديد
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="لا توجد منتجات"
          description={
            status
              ? "لا توجد منتجات بهذه الحالة."
              : "لم تتم مزامنة الكتالوج بعد — شغّل المزامنة من تبويب المزامنة والاستيراد."
          }
        />
      ) : (
        <SectionCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  {["المنتج", "الفئة", "النوع", "السعر", "المخزون", "المصدر", "الحالة", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="text-right px-4 py-3 text-xs font-semibold text-[#64748b] whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[#f8fafc] hover:bg-[#fafbfc] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/store/products/${p.id}`} className="flex items-center gap-3 group">
                        <Thumb p={p} />
                        <span className="min-w-0">
                          <span className="block font-medium text-[#1e293b] group-hover:text-[#104e98] truncate max-w-64">
                            {p.name}
                          </span>
                          <span className="block text-xs text-[#94a3b8] ltr truncate max-w-64">
                            {p.externalId}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#64748b] whitespace-nowrap">{p.category}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.kind === "digital" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">
                          <Zap className="h-3 w-3" /> رقمي
                        </span>
                      ) : (
                        <span className="text-xs text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-full">
                          مادي
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <CurrencyDisplay amount={p.price} currency={p.currency} size="sm" />
                      {p.variantCount > 0 && (
                        <span className="block text-xs text-[#94a3b8]">
                          {p.variantCount} خيارات
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.kind === "digital" ? (
                        <span className="text-xs text-[#94a3b8]">غير محدود</span>
                      ) : (
                        <span className={cn("font-semibold", STOCK_TONE[p.stock])}>
                          {p.stockQty}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-[#64748b]">
                        {p.origin === "manual" ? "يدوي" : "مزامنة"}
                      </span>
                      {p.edited && (
                        <span className="mr-1 text-xs text-[#104e98] bg-[#e8f0fc] px-1.5 py-0.5 rounded-full">
                          معدّل
                        </span>
                      )}
                      {!p.active && (
                        <span className="mr-1 text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                          محذوف من المصدر
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          STATUS_BADGE[p.status].cls,
                        )}
                      >
                        {STATUS_BADGE[p.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <ProductStatusActions productId={p.id} status={p.status} />
                        <Button size="icon-sm" variant="ghost" asChild aria-label="تعديل">
                          <Link href={`/store/products/${p.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
