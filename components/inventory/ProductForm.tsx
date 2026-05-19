"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField, SectionCard } from "@/components/shared";
import type { Category, Supplier, Product } from "@prisma/client";

interface ProductFormProps {
  initialData?: Partial<Product>;
  isEdit?: boolean;
}

export function ProductForm({ initialData, isEdit }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    sku: initialData?.sku ?? "",
    barcode: initialData?.barcode ?? "",
    description: initialData?.description ?? "",
    unit: initialData?.unit ?? "PIECE",
    categoryId: initialData?.categoryId ?? "",
    supplierId: initialData?.supplierId ?? "",
    costPrice: initialData?.costPrice ? String(Number(initialData.costPrice)) : "",
    sellPrice: initialData?.sellPrice ? String(Number(initialData.sellPrice)) : "",
    stockQty: initialData?.stockQty ? String(initialData.stockQty) : "0",
    minStockQty: initialData?.minStockQty ? String(initialData.minStockQty) : "0",
    isActive: initialData?.isActive ?? true,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/suppliers?all=true").then((r) => r.json()),
    ]).then(([cats, sups]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
    });
  }, []);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { setError("اسم المنتج مطلوب"); return; }
    if (!form.costPrice || !form.sellPrice) { setError("أسعار المنتج مطلوبة"); return; }

    setLoading(true);
    setError("");
    setExistingProductId(null);

    const payload = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      description: form.description || null,
      unit: form.unit,
      categoryId: form.categoryId || null,
      supplierId: form.supplierId || null,
      costPrice: parseFloat(form.costPrice),
      sellPrice: parseFloat(form.sellPrice),
      stockQty: parseInt(form.stockQty) || 0,
      minStockQty: parseInt(form.minStockQty) || 0,
      isActive: form.isActive,
    };

    try {
      const url = isEdit
        ? `/api/products/${initialData?.id}`
        : "/api/products";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        if (data.existingProductId) setExistingProductId(data.existingProductId);
        return;
      }

      router.push(`/inventory/${data.id}`);
      router.refresh();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  const UNIT_LABELS = {
    PIECE: "قطعة",
    BOX: "كرتون",
    SET: "طقم",
    METER: "متر",
    OTHER: "أخرى",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <SectionCard title="معلومات المنتج">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="اسم المنتج" htmlFor="name" required className="md:col-span-2">
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="مثال: Samsung Galaxy S24"
            />
          </FormField>

          <FormField label="الفئة" htmlFor="category">
            <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الفئة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون فئة</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="المورد" htmlFor="supplier">
            <Select value={form.supplierId} onValueChange={(v) => set("supplierId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المورد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون مورد</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="رمز SKU" htmlFor="sku">
            <Input
              id="sku"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="مثال: PROD-001"
              dir="ltr"
            />
          </FormField>

          <FormField label="باركود" htmlFor="barcode">
            <Input
              id="barcode"
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder="6901234567890"
              dir="ltr"
            />
          </FormField>

          <FormField label="وحدة القياس">
            <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="وصف المنتج" className="md:col-span-2">
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="وصف اختياري..."
              rows={2}
            />
          </FormField>
        </div>
      </SectionCard>

      {/* Pricing */}
      <SectionCard title="الأسعار">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="سعر التكلفة (₪)" htmlFor="costPrice" required>
            <Input
              id="costPrice"
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => set("costPrice", e.target.value)}
              placeholder="0.00"
              dir="ltr"
            />
          </FormField>

          <FormField label="سعر البيع (₪)" htmlFor="sellPrice" required>
            <Input
              id="sellPrice"
              type="number"
              min="0"
              step="0.01"
              value={form.sellPrice}
              onChange={(e) => set("sellPrice", e.target.value)}
              placeholder="0.00"
              dir="ltr"
            />
          </FormField>

          {form.costPrice && form.sellPrice && (
            <div className="md:col-span-2 bg-[#f8fafc] rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-[#64748b]">هامش الربح</span>
              <span className="font-medium text-green-600">
                {(
                  ((parseFloat(form.sellPrice) - parseFloat(form.costPrice)) /
                    parseFloat(form.costPrice)) *
                  100
                ).toFixed(1)}
                %{" "}
                <span className="text-[#64748b] text-xs">
                  (₪{" "}
                  {(
                    parseFloat(form.sellPrice) - parseFloat(form.costPrice)
                  ).toFixed(2)}
                  )
                </span>
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Stock */}
      <SectionCard title="المخزون">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isEdit && (
            <FormField
              label="الكمية الحالية"
              htmlFor="stockQty"
              hint="الرصيد الافتتاحي"
            >
              <Input
                id="stockQty"
                type="number"
                min="0"
                value={form.stockQty}
                onChange={(e) => set("stockQty", e.target.value)}
                dir="ltr"
              />
            </FormField>
          )}

          <FormField
            label="حد التنبيه (الحد الأدنى)"
            htmlFor="minStockQty"
            hint="سيظهر تنبيه عند الوصول لهذا الحد"
          >
            <Input
              id="minStockQty"
              type="number"
              min="0"
              value={form.minStockQty}
              onChange={(e) => set("minStockQty", e.target.value)}
              dir="ltr"
            />
          </FormField>
        </div>
      </SectionCard>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg space-y-2">
          <p>{error}</p>
          {existingProductId && (
            <Link
              href={`/inventory/${existingProductId}`}
              className="inline-block text-[#104e98] underline hover:text-[#0b3d7a]"
            >
              فتح المنتج الموجود
            </Link>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          إلغاء
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "جاري الحفظ..."
            : isEdit
            ? "حفظ التغييرات"
            : "إضافة المنتج"}
        </Button>
      </div>
    </form>
  );
}
