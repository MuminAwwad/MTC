"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Edit,
  TrendingUp,
  TrendingDown,
  Settings,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  CurrencyDisplay,
  StatusBadge,
  SectionCard,
  ConfirmDialog,
} from "@/components/shared";
import { StockAdjustmentDialog } from "@/components/inventory/StockAdjustmentDialog";
import { ProductForm } from "@/components/inventory/ProductForm";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { STOCK_MOVEMENT_LABELS } from "@/lib/constants";
import type { Product, Category, Supplier, StockMovement, InvoiceItem, Invoice, Customer, InvoiceStatus, StockMovementType } from "@prisma/client";

type ProductDetail = Product & {
  category: Category | null;
  supplier: Supplier | null;
  stockMovements: (StockMovement & { createdBy: { name: string } | null })[];
  invoiceItems: (InvoiceItem & {
    invoice: {
      invoiceNumber: string;
      createdAt: Date;
      status: InvoiceStatus;
      customer: { name: string };
    };
  })[];
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((d) => { setProduct(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setDeleteLoading(false);
    router.push("/inventory");
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-[#e2e8f0] rounded" />
        <div className="h-48 bg-white rounded-xl border border-[#e2e8f0]" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-16">
        <p className="text-[#64748b]">المنتج غير موجود</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/inventory">العودة للمخزون</Link>
        </Button>
      </div>
    );
  }

  const isLow = product.stockQty <= product.minStockQty;
  const profitMargin = product.sellPrice && product.costPrice
    ? ((Number(product.sellPrice) - Number(product.costPrice)) / Number(product.costPrice) * 100).toFixed(1)
    : null;

  if (editMode) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon-sm" onClick={() => setEditMode(false)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <PageHeader
            title={`تعديل: ${product.name}`}
            breadcrumb={[
              { label: "المخزون", href: "/inventory" },
              { label: product.name, href: `/inventory/${id}` },
              { label: "تعديل" },
            ]}
          />
        </div>
        <ProductForm initialData={product} isEdit />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={product.name}
        subtitle={product.sku ?? product.category?.name ?? ""}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "المخزون", href: "/inventory" },
          { label: product.name },
        ]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
              تعديل المخزون
            </Button>
            <Button size="sm" onClick={() => setEditMode(true)}>
              <Edit className="h-4 w-4" />
              تعديل
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="movements">حركات المخزون ({product.stockMovements.length})</TabsTrigger>
          <TabsTrigger value="sales">المبيعات ({product.invoiceItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stats */}
            <div className="lg:col-span-1 space-y-4">
              <SectionCard title="المخزون">
                <div className="text-center py-2">
                  <div className={`text-4xl font-bold mb-1 ${isLow ? "text-red-600" : "text-[#0b2345]"}`}>
                    {product.stockQty}
                  </div>
                  <p className="text-sm text-[#64748b]">
                    حد التنبيه: {product.minStockQty}
                  </p>
                  {isLow && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      ⚠ المخزون منخفض
                    </p>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="الأسعار">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#64748b]">سعر التكلفة</span>
                    <CurrencyDisplay amount={Number(product.costPrice)} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#64748b]">سعر البيع</span>
                    <CurrencyDisplay amount={Number(product.sellPrice)} className="font-semibold text-[#0b2345]" />
                  </div>
                  {profitMargin && (
                    <div className="flex justify-between items-center pt-2 border-t border-[#f1f5f9]">
                      <span className="text-sm text-[#64748b]">هامش الربح</span>
                      <span className="text-sm font-medium text-green-600">
                        {profitMargin}%
                      </span>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>

            {/* Details */}
            <div className="lg:col-span-2 space-y-4">
              <SectionCard title="معلومات المنتج">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ["الفئة", product.category?.name ?? "—"],
                    ["المورد", product.supplier?.name ?? "—"],
                    ["رمز SKU", product.sku ?? "—"],
                    ["باركود", product.barcode ?? "—"],
                    ["وحدة القياس", product.unit],
                    ["تاريخ الإضافة", formatDate(product.createdAt)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[#94a3b8] mb-0.5">{label}</p>
                      <p className="font-medium text-[#1e293b] ltr">{value}</p>
                    </div>
                  ))}
                </div>
                {product.description && (
                  <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
                    <p className="text-[#94a3b8] text-sm mb-1">الوصف</p>
                    <p className="text-sm text-[#1e293b]">{product.description}</p>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="قيمة المخزون">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[#94a3b8] mb-0.5">قيمة التكلفة الإجمالية</p>
                    <CurrencyDisplay
                      amount={Number(product.costPrice) * product.stockQty}
                      className="font-semibold text-[#0b2345]"
                    />
                  </div>
                  <div>
                    <p className="text-[#94a3b8] mb-0.5">قيمة البيع الإجمالية</p>
                    <CurrencyDisplay
                      amount={Number(product.sellPrice) * product.stockQty}
                      className="font-semibold text-green-600"
                    />
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <SectionCard noPadding>
            {product.stockMovements.length === 0 ? (
              <p className="text-center py-8 text-[#64748b] text-sm">لا توجد حركات مخزون</p>
            ) : (
              <>
              {/* Mobile: cards */}
              <ul className="md:hidden divide-y divide-[#f1f5f9]">
                {product.stockMovements.map((m) => (
                  <li key={m.id} className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        {m.type === "IN" ? <TrendingUp className="h-4 w-4 text-green-600" /> : m.type === "OUT" ? <TrendingDown className="h-4 w-4 text-red-600" /> : <Settings className="h-4 w-4 text-blue-600" />}
                        <span className="text-sm">{STOCK_MOVEMENT_LABELS[m.type as StockMovementType]}</span>
                      </div>
                      <span className="font-bold">{m.qty}</span>
                    </div>
                    {m.note && <p className="text-xs text-[#64748b]">{m.note}</p>}
                    <div className="flex items-center justify-between mt-1 text-xs text-[#94a3b8]">
                      <span>{m.createdBy?.name ?? "—"}</span>
                      <span className="ltr">{formatDateTime(m.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["النوع", "الكمية", "ملاحظة", "المستخدم", "التاريخ"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.stockMovements.map((m) => (
                    <tr key={m.id} className="border-b border-[#f8fafc]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {m.type === "IN" ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : m.type === "OUT" ? (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <Settings className="h-4 w-4 text-blue-600" />
                          )}
                          <span>{STOCK_MOVEMENT_LABELS[m.type as StockMovementType]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">{m.qty}</td>
                      <td className="px-4 py-3 text-[#64748b]">{m.note ?? "—"}</td>
                      <td className="px-4 py-3 text-[#64748b]">{m.createdBy?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#94a3b8] ltr text-xs">{formatDateTime(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="sales">
          <SectionCard noPadding>
            {product.invoiceItems.length === 0 ? (
              <p className="text-center py-8 text-[#64748b] text-sm">لم يُباع هذا المنتج بعد</p>
            ) : (
              <>
              {/* Mobile: cards */}
              <ul className="md:hidden divide-y divide-[#f1f5f9]">
                {product.invoiceItems.map((item) => (
                  <li key={item.id} className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link href={`/invoices/${item.invoice.invoiceNumber}`} className="text-[#104e98] hover:underline ltr font-medium text-sm">
                        {item.invoice.invoiceNumber}
                      </Link>
                      <StatusBadge status={{ type: "invoice", status: item.invoice.status }} />
                    </div>
                    <p className="text-sm text-[#1e293b] mb-1">{item.invoice.customer.name}</p>
                    <div className="flex items-center justify-between text-xs text-[#94a3b8]">
                      <span>الكمية: <span className="font-medium text-[#1e293b]">{item.qty}</span> · <CurrencyDisplay amount={Number(item.unitPrice)} size="sm" /></span>
                      <span className="ltr">{formatDate(item.invoice.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["الفاتورة", "العميل", "الكمية", "السعر", "الحالة", "التاريخ"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.invoiceItems.map((item) => (
                    <tr key={item.id} className="border-b border-[#f8fafc]">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${item.invoice.invoiceNumber}`} className="text-[#104e98] hover:underline ltr">
                          {item.invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{item.invoice.customer.name}</td>
                      <td className="px-4 py-3">{item.qty}</td>
                      <td className="px-4 py-3"><CurrencyDisplay amount={Number(item.unitPrice)} size="sm" /></td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "invoice", status: item.invoice.status }} />
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8] ltr text-xs">{formatDate(item.invoice.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <StockAdjustmentDialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onSuccess={(newQty) => {
          setProduct((p) => p ? { ...p, stockQty: newQty } : p);
          setAdjustOpen(false);
        }}
        productId={id}
        productName={product.name}
        currentStock={product.stockQty}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف المنتج"
        description={`هل أنت متأكد من حذف "${product.name}"؟`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </div>
  );
}
