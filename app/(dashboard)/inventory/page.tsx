"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, LayoutGrid, List, AlertTriangle, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  SearchInput,
  StatusBadge,
  CurrencyDisplay,
  EmptyState,
  Pagination,
  ConfirmDialog,
  SectionCard,
} from "@/components/shared";
import { StockAdjustmentDialog } from "@/components/inventory/StockAdjustmentDialog";
import type { Product, Category, Supplier } from "@prisma/client";

type ProductRow = Product & {
  category: Category | null;
  supplier: Supplier | null;
  _count: { invoiceItems: number };
};

interface ProductsResponse {
  data: ProductRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  lowStockCount: number;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [meta, setMeta] = useState<Omit<ProductsResponse, "data">>({
    total: 0, page: 1, limit: 20, totalPages: 0, lowStockCount: 0,
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("list");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [adjustProduct, setAdjustProduct] = useState<ProductRow | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: String(page),
      ...(categoryFilter !== "all" ? { categoryId: categoryFilter } : {}),
      ...(lowStockFilter ? { lowStock: "true" } : {}),
    });
    try {
      const res = await fetch(`/api/products?${params}`);
      const data: ProductsResponse = await res.json();
      setProducts(data.data ?? []);
      setMeta({
        total: data.total,
        page: data.page,
        limit: data.limit,
        totalPages: data.totalPages,
        lowStockCount: data.lowStockCount,
      });
    } finally {
      setLoading(false);
    }
  }, [search, page, categoryFilter, lowStockFilter]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []));
  }, []);

  const handleDelete = async () => {
    if (!deleteProduct) return;
    setDeleteLoading(true);
    await fetch(`/api/products/${deleteProduct.id}`, { method: "DELETE" });
    setDeleteLoading(false);
    setDeleteProduct(null);
    loadProducts();
  };

  const handleStockSuccess = (productId: string, newQty: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stockQty: newQty } : p))
    );
    setAdjustProduct(null);
  };

  return (
    <div>
      <PageHeader
        title="المخزون"
        subtitle={`${meta.total} منتج`}
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "المخزون" }]}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" asChild size="sm">
              <Link href="/inventory/movements">سجل الحركات</Link>
            </Button>
            <Button variant="outline" asChild size="sm">
              <Link href="/inventory/import" className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                استيراد فاتورة شراء
              </Link>
            </Button>
            <Button asChild>
              <Link href="/inventory/new">
                <Plus className="h-4 w-4" />
                منتج جديد
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <SectionCard className="mb-4" noPadding>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput
            onSearch={(v) => { setSearch(v); setPage(1); }}
            placeholder="بحث بالاسم، SKU، باركود..."
            className="flex-1 min-w-48"
          />
          <Select
            value={categoryFilter}
            onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل الفئات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => { setLowStockFilter(!lowStockFilter); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              lowStockFilter
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-white border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc]"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            ناقص ({meta.lowStockCount})
          </button>

          <div className="flex border border-[#e2e8f0] rounded-lg overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`p-2 ${view === "list" ? "bg-[#104e98] text-white" : "bg-white text-[#64748b]"}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-2 ${view === "grid" ? "bg-[#104e98] text-white" : "bg-white text-[#64748b]"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </SectionCard>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e2e8f0] h-16 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="لا توجد منتجات"
          description={search ? "لم يتم العثور على نتائج للبحث" : "ابدأ بإضافة منتجك الأول"}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductGridCard
              key={p.id}
              product={p}
              onAdjust={() => setAdjustProduct(p)}
            />
          ))}
        </div>
      ) : (
        <SectionCard noPadding>
          {/* Mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-[#f1f5f9]">
            {products.map((p) => {
              const isLow = p.stockQty <= p.minStockQty;
              return (
                <li key={p.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/inventory/${p.id}`} className="min-w-0">
                      <p className="font-medium text-[#1e293b] break-words">{p.name}</p>
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        {p.sku && <span className="ltr">{p.sku}</span>}
                        {p.sku && p.category?.name && " · "}
                        {p.category?.name}
                      </p>
                    </Link>
                    <StatusBadge
                      status={{
                        type: "custom",
                        label: p.isActive ? "نشط" : "غير نشط",
                        color: p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                      }}
                    />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-[#64748b]">المخزون</dt>
                      <dd className={`mt-0.5 font-semibold flex items-center gap-1 ${isLow ? "text-red-600" : "text-[#1e293b]"}`}>
                        {p.stockQty}
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">التكلفة</dt>
                      <dd className="mt-0.5 ltr text-[#1e293b]">₪{Number(p.costPrice).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">البيع</dt>
                      <dd className="mt-0.5 ltr text-[#1e293b]">₪{Number(p.sellPrice).toFixed(2)}</dd>
                    </div>
                  </dl>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setAdjustProduct(p)}>
                      تعديل المخزون
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                      <Link href={`/inventory/${p.id}`}>عرض</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">المنتج</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">الفئة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">سعر التكلفة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">سعر البيع</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">المخزون</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">الحالة</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const isLow = p.stockQty <= p.minStockQty;
                  return (
                    <tr key={p.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc] transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${p.id}`} className="hover:text-[#104e98]">
                          <p className="font-medium text-[#1e293b]">{p.name}</p>
                          {p.sku && <p className="text-xs text-[#94a3b8] mt-0.5 ltr">{p.sku}</p>}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{p.category?.name ?? "—"}</td>
                      <td className="px-4 py-3"><CurrencyDisplay amount={Number(p.costPrice)} size="sm" /></td>
                      <td className="px-4 py-3"><CurrencyDisplay amount={Number(p.sellPrice)} size="sm" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isLow ? "text-red-600" : "text-[#1e293b]"}`}>
                            {p.stockQty}
                          </span>
                          {isLow && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={{
                            type: "custom",
                            label: p.isActive ? "نشط" : "غير نشط",
                            color: p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                          }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setAdjustProduct(p)}>
                            تعديل المخزون
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/inventory/${p.id}`}>عرض</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={meta.limit}
            onPageChange={setPage}
          />
        </SectionCard>
      )}

      {adjustProduct && (
        <StockAdjustmentDialog
          open
          onClose={() => setAdjustProduct(null)}
          onSuccess={(newQty) => handleStockSuccess(adjustProduct.id, newQty)}
          productId={adjustProduct.id}
          productName={adjustProduct.name}
          currentStock={adjustProduct.stockQty}
        />
      )}

      <ConfirmDialog
        open={!!deleteProduct}
        onClose={() => setDeleteProduct(null)}
        onConfirm={handleDelete}
        title="حذف المنتج"
        description={`هل أنت متأكد من حذف "${deleteProduct?.name}"؟`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </div>
  );
}

function ProductGridCard({
  product,
  onAdjust,
}: {
  product: ProductRow;
  onAdjust: () => void;
}) {
  const isLow = product.stockQty <= product.minStockQty;
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <Link href={`/inventory/${product.id}`} className="font-medium text-[#1e293b] hover:text-[#104e98] line-clamp-1">
            {product.name}
          </Link>
          {product.sku && <p className="text-xs text-[#94a3b8] ltr mt-0.5">{product.sku}</p>}
        </div>
        {product.category && (
          <span className="text-xs bg-[#e8f0fc] text-[#104e98] px-2 py-0.5 rounded-full mr-2 whitespace-nowrap">
            {product.category.name}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
        <div>
          <p className="text-xs text-[#94a3b8]">سعر البيع</p>
          <CurrencyDisplay amount={Number(product.sellPrice)} size="sm" className="font-semibold" />
        </div>
        <div className="text-left">
          <p className="text-xs text-[#94a3b8]">المخزون</p>
          <div className="flex items-center gap-1 justify-end">
            <span className={`font-semibold ${isLow ? "text-red-600" : "text-[#1e293b]"}`}>{product.stockQty}</span>
            {isLow && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={onAdjust}>
          تعديل المخزون
        </Button>
        <Button size="sm" variant="ghost" asChild className="flex-1 text-xs">
          <Link href={`/inventory/${product.id}`}>تفاصيل</Link>
        </Button>
      </div>
    </div>
  );
}
