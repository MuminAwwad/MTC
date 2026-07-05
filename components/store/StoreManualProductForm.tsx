"use client";

// Create/edit form for *manual* store products (origin "manual") — products
// that exist only in the store, not in this system's inventory. Their values
// are written to the product's own columns and syncs never touch them.
//
// Images are pasted as URLs for now; file upload lands with the media library.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, FormField, ConfirmDialog } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import type {
  ManualProductInput,
  ManualVariantInput,
  ProductKind,
  ProductStatus,
  StoreCurrency,
} from "@/lib/store/types";

interface VariantRow {
  name: string;
  sku: string;
  price: string;
  was: string;
  stockQty: string;
  image: string;
}

interface FormState {
  name: string;
  nameAr: string;
  brand: string;
  category: string;
  kind: ProductKind;
  currency: StoreCurrency;
  price: string;
  was: string;
  stockQty: string;
  stockLabel: string;
  description: string;
  descriptionAr: string;
  icon: string;
  images: string; // one URL per line
  variants: VariantRow[];
  status: ProductStatus;
}

const emptyVariant = (): VariantRow => ({
  name: "",
  sku: "",
  price: "",
  was: "",
  stockQty: "0",
  image: "",
});

function fromInput(p?: Partial<ManualProductInput>): FormState {
  return {
    name: p?.name ?? "",
    nameAr: p?.nameAr ?? "",
    brand: p?.brand ?? "",
    category: p?.category ?? "",
    kind: p?.kind ?? "physical",
    currency: p?.currency ?? "ILS",
    price: p?.price != null ? String(p.price) : "",
    was: p?.was != null ? String(p.was) : "",
    stockQty: p?.stockQty != null ? String(p.stockQty) : "0",
    stockLabel: p?.stockLabel ?? "",
    description: p?.description ?? "",
    descriptionAr: p?.descriptionAr ?? "",
    icon: p?.icon ?? "",
    images: (p?.images ?? []).join("\n"),
    variants: (p?.variants ?? []).map((v) => ({
      name: v.name,
      sku: v.sku ?? "",
      price: v.price != null ? String(v.price) : "",
      was: v.was != null ? String(v.was) : "",
      stockQty: String(v.stockQty ?? 0),
      image: v.image ?? "",
    })),
    status: p?.status ?? "draft",
  };
}

export function StoreManualProductForm({
  productId,
  initial,
}: {
  /** Present when editing an existing manual product. */
  productId?: string;
  initial?: Partial<ManualProductInput>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(fromInput(initial));
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isEdit = Boolean(productId);
  const symbol = form.currency === "USD" ? "$" : "₪";
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setVariant = (i: number, k: keyof VariantRow, v: string) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((row, j) => (j === i ? { ...row, [k]: v } : row)),
    }));

  function toInput(status: ProductStatus): ManualProductInput {
    const num = (v: string): number | undefined =>
      v.trim() === "" ? undefined : Number(v);
    const variants: ManualVariantInput[] = form.variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        name: v.name.trim(),
        sku: v.sku.trim() || undefined,
        price: num(v.price),
        was: num(v.was),
        stockQty: Math.max(0, Math.trunc(Number(v.stockQty) || 0)),
        image: v.image.trim() || undefined,
      }));
    return {
      name: form.name,
      nameAr: form.nameAr.trim() || undefined,
      brand: form.brand.trim() || undefined,
      category: form.category.trim() || undefined,
      kind: form.kind,
      price: Number(form.price) || 0,
      was: num(form.was),
      currency: form.currency,
      stockQty: Math.max(0, Math.trunc(Number(form.stockQty) || 0)),
      stockLabel: form.stockLabel.trim() || undefined,
      description: form.description.trim() || undefined,
      descriptionAr: form.descriptionAr.trim() || undefined,
      icon: form.icon.trim() || undefined,
      images: form.images
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean),
      variants,
      status,
    };
  }

  async function submit(status: ProductStatus) {
    if (!form.name.trim()) {
      toast("اسم المنتج مطلوب", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        isEdit ? `/api/store/products/${productId}` : "/api/store/products",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? { manual: toInput(status) } : toInput(status)),
        },
      );
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "حدث خطأ ما", "error");
        return;
      }
      toast(status === "published" ? "تم الحفظ والنشر" : "تم الحفظ كمسودة");
      if (isEdit) {
        set("status", status);
        router.refresh();
      } else {
        router.push(`/store/products/${data.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!productId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/store/products/${productId}`, { method: "DELETE" });
    const data = await res.json();
    setDeleteLoading(false);
    if (!res.ok || data?.error) {
      toast(data?.error ?? "تعذّر الحذف", "error");
      setDeleteOpen(false);
      return;
    }
    router.push("/store/products");
  }

  const selectCls =
    "w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#104e98]";

  return (
    <div className="space-y-6">
      <SectionCard title="البيانات الأساسية">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="الاسم" htmlFor="m-name" required>
            <Input
              id="m-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="مثال: لوحة مفاتيح ميكانيكية"
            />
          </FormField>
          <FormField label="الاسم (بالعربية)" htmlFor="m-nameAr">
            <Input id="m-nameAr" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
          </FormField>
          <FormField label="العلامة التجارية" htmlFor="m-brand">
            <Input id="m-brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </FormField>
          <FormField label="الفئة" htmlFor="m-category" hint="اكتب اسم الفئة — تُنشأ تلقائياً إن كانت جديدة">
            <Input id="m-category" value={form.category} onChange={(e) => set("category", e.target.value)} />
          </FormField>
          <FormField label="النوع" htmlFor="m-kind">
            <select
              id="m-kind"
              className={selectCls}
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as ProductKind)}
            >
              <option value="physical">مادي — يُشحن ويُخزّن</option>
              <option value="digital">رقمي — تسليم فوري</option>
            </select>
          </FormField>
          <FormField label="العملة" htmlFor="m-currency">
            <select
              id="m-currency"
              className={selectCls}
              value={form.currency}
              onChange={(e) => set("currency", e.target.value as StoreCurrency)}
            >
              <option value="ILS">شيكل (₪)</option>
              <option value="USD">دولار ($)</option>
            </select>
          </FormField>
          <FormField label={`السعر (${symbol})`} htmlFor="m-price" required>
            <Input id="m-price" type="number" min="0" dir="ltr" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </FormField>
          <FormField label={`السعر قبل الخصم (${symbol})`} htmlFor="m-was">
            <Input id="m-was" type="number" min="0" dir="ltr" value={form.was} onChange={(e) => set("was", e.target.value)} />
          </FormField>
          {form.kind === "physical" ? (
            <>
              <FormField label="الكمية في المخزون" htmlFor="m-stock">
                <Input id="m-stock" type="number" min="0" dir="ltr" value={form.stockQty} onChange={(e) => set("stockQty", e.target.value)} />
              </FormField>
              <FormField label="وصف المخزون" htmlFor="m-stockLabel" hint="اختياري — مثل «قطعتان متبقيتان»">
                <Input id="m-stockLabel" value={form.stockLabel} onChange={(e) => set("stockLabel", e.target.value)} />
              </FormField>
            </>
          ) : (
            <FormField label="الأيقونة (للمنتج الرقمي)" htmlFor="m-icon" hint="اسم رمز Material، مثل «vpn_key»">
              <Input id="m-icon" dir="ltr" value={form.icon} onChange={(e) => set("icon", e.target.value)} />
            </FormField>
          )}
          <FormField label="الوصف" htmlFor="m-desc">
            <Textarea id="m-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <FormField label="الوصف (بالعربية)" htmlFor="m-descAr">
            <Textarea id="m-descAr" rows={3} value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="الصور">
        <FormField
          label="روابط الصور"
          htmlFor="m-images"
          hint="رابط واحد في كل سطر — الأول هو الصورة الرئيسية. (رفع الملفات سيتوفر مع مكتبة الوسائط)"
        >
          <Textarea
            id="m-images"
            rows={3}
            dir="ltr"
            value={form.images}
            onChange={(e) => set("images", e.target.value)}
            placeholder="https://…/image.jpg"
          />
        </FormField>
        {form.images.trim() && (
          <div className="flex flex-wrap gap-2 mt-3">
            {form.images
              .split("\n")
              .map((u) => u.trim())
              .filter(Boolean)
              .map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-16 w-16 rounded-lg border border-[#e2e8f0] object-cover" />
              ))}
          </div>
        )}
      </SectionCard>

      {form.kind === "physical" && (
        <SectionCard
          title="الخيارات (مقاس/لون/سعة)"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => set("variants", [...form.variants, emptyVariant()])}>
              <Plus className="h-4 w-4" /> إضافة خيار
            </Button>
          }
        >
          {form.variants.length === 0 ? (
            <p className="text-sm text-[#64748b]">منتج بسيط بلا خيارات. أضف خياراً إذا كان للمنتج مقاسات أو ألوان.</p>
          ) : (
            <div className="space-y-3">
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
                  <Input className="md:col-span-2" value={v.name} onChange={(e) => setVariant(i, "name", e.target.value)} placeholder="الاسم، مثل «256GB / أسود»" />
                  <Input dir="ltr" value={v.sku} onChange={(e) => setVariant(i, "sku", e.target.value)} placeholder="SKU" />
                  <Input type="number" dir="ltr" value={v.price} onChange={(e) => setVariant(i, "price", e.target.value)} placeholder={`السعر ${symbol}`} />
                  <Input type="number" dir="ltr" value={v.stockQty} onChange={(e) => setVariant(i, "stockQty", e.target.value)} placeholder="المخزون" />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 justify-self-end"
                    onClick={() => set("variants", form.variants.filter((_, j) => j !== i))}
                    aria-label="حذف الخيار"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-[#94a3b8]">اترك سعر الخيار فارغاً ليرث سعر المنتج.</p>
            </div>
          )}
        </SectionCard>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => submit("published")} className="bg-green-600 hover:bg-green-700">
          <Eye className="h-4 w-4" />
          {busy ? "جاري الحفظ..." : "حفظ ونشر"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => submit("draft")}>
          <Save className="h-4 w-4" /> حفظ كمسودة
        </Button>
        {isEdit && (
          <Button
            variant="outline"
            disabled={busy}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 mr-auto"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> حذف المنتج
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف منتج المتجر"
        description={`هل أنت متأكد من حذف "${form.name}" نهائياً من المتجر؟`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </div>
  );
}
