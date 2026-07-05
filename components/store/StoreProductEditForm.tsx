"use client";

// Review/edit form for a *synced* store product. Fields are prefilled with the
// admin's override when one exists, else the value synced from this system.
// Only fields that differ from the source are saved as overrides — clearing a
// field reverts it to the synced value on the storefront.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Archive, Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, FormField } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import type { StoreAdminProductDetail } from "@/lib/store/catalog";
import type { ProductOverrides, ProductStatus } from "@/lib/store/types";

const STATUS_BADGE: Record<ProductStatus, { label: string; cls: string }> = {
  published: { label: "منشور — ظاهر للعملاء", cls: "bg-green-100 text-green-700" },
  draft: { label: "مسودة — مخفي", cls: "bg-yellow-100 text-yellow-700" },
  archived: { label: "مؤرشف", cls: "bg-gray-100 text-gray-600" },
};

function SyncedHint({ source }: { source?: string | number }) {
  if (source === undefined || source === "") return null;
  return (
    <span className="font-normal text-xs text-[#94a3b8]">مُزامن: {String(source)}</span>
  );
}

export function StoreProductEditForm({ detail }: { detail: StoreAdminProductDetail }) {
  const router = useRouter();
  const { toast } = useToast();
  const s = detail.source;
  const o = detail.overrides;
  const symbol = s.currency === "USD" ? "$" : "₪";

  const initialPrice = o.price ?? s.price;
  const initialWas = o.was ?? s.was;
  const [form, setForm] = useState({
    name: o.name ?? s.name ?? "",
    nameAr: o.nameAr ?? s.nameAr ?? "",
    brand: o.brand ?? s.brand ?? "",
    category: o.category ?? s.category ?? "",
    price: initialPrice != null ? String(initialPrice) : "",
    was: initialWas != null ? String(initialWas) : "",
    description: o.description ?? s.description ?? "",
    descriptionAr: o.descriptionAr ?? s.descriptionAr ?? "",
    image: o.image ?? s.image ?? "",
    icon: o.icon ?? s.icon ?? "",
    stockLabel: o.stockLabel ?? s.stockLabel ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ProductStatus>(detail.status);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Only save fields that differ from the synced source values.
  function buildOverrides(): ProductOverrides {
    const ov: ProductOverrides = {};
    const t = (v: string) => v.trim();
    const diff = (val: string, src: string | undefined) =>
      t(val) !== "" && t(val) !== (src ?? "");
    if (diff(form.name, s.name)) ov.name = t(form.name);
    if (diff(form.nameAr, s.nameAr)) ov.nameAr = t(form.nameAr);
    if (diff(form.brand, s.brand)) ov.brand = t(form.brand);
    if (diff(form.category, s.category)) ov.category = t(form.category);
    if (diff(form.description, s.description)) ov.description = t(form.description);
    if (diff(form.descriptionAr, s.descriptionAr)) ov.descriptionAr = t(form.descriptionAr);
    if (diff(form.image, s.image)) ov.image = t(form.image);
    if (diff(form.icon, s.icon)) ov.icon = t(form.icon);
    if (diff(form.stockLabel, s.stockLabel)) ov.stockLabel = t(form.stockLabel);
    if (form.price !== "" && Number(form.price) !== s.price) ov.price = Number(form.price);
    if (form.was !== "" && Number(form.was) !== (s.was ?? NaN)) ov.was = Number(form.was);
    return ov;
  }

  async function run(next: ProductStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/store/products/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: buildOverrides(), status: next }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "حدث خطأ ما", "error");
      } else {
        setStatus(next);
        toast("تم الحفظ");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[status].cls}`}>
            {STATUS_BADGE[status].label}
          </span>
          <span className="text-[#94a3b8] ltr">{detail.externalId}</span>
          {detail.variantCount > 0 && (
            <span className="text-[#94a3b8]">· {detail.variantCount} خيارات</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status !== "published" ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run("published")}
              className="bg-green-600 hover:bg-green-700"
            >
              <Eye className="h-4 w-4" /> نشر
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("draft")}>
              <EyeOff className="h-4 w-4" /> إلغاء النشر
            </Button>
          )}
          {status !== "archived" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("archived")}>
              <Archive className="h-4 w-4" /> أرشفة
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          الحقول معبّأة مسبقاً بالقيم المُزامنة من نظام الإدارة. عدّل أيّاً منها — تطغى تعديلاتك
          على القيمة المُزامنة وتبقى محفوظة مع كل مزامنة لاحقة. أفرغ الحقل للعودة إلى القيمة
          المُزامنة.
        </p>
      </div>

      <SectionCard title="اللمسات النهائية">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="الاسم" htmlFor="name">
            <div className="space-y-1">
              <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={s.name} />
              <SyncedHint source={s.name} />
            </div>
          </FormField>
          <FormField label="العلامة التجارية" htmlFor="brand">
            <div className="space-y-1">
              <Input id="brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder={s.brand} />
              <SyncedHint source={s.brand} />
            </div>
          </FormField>
          <FormField label={`السعر (${symbol})`} htmlFor="price">
            <div className="space-y-1">
              <Input id="price" type="number" dir="ltr" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder={String(s.price)} />
              <SyncedHint source={s.price} />
            </div>
          </FormField>
          <FormField label={`السعر قبل الخصم (${symbol})`} htmlFor="was">
            <div className="space-y-1">
              <Input id="was" type="number" dir="ltr" value={form.was} onChange={(e) => set("was", e.target.value)} placeholder={s.was != null ? String(s.was) : ""} />
              <SyncedHint source={s.was} />
            </div>
          </FormField>
          <FormField label="الفئة" htmlFor="category">
            <div className="space-y-1">
              <Input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder={s.category} />
              <SyncedHint source={s.category} />
            </div>
          </FormField>
          <FormField label="وصف المخزون" htmlFor="stockLabel">
            <div className="space-y-1">
              <Input id="stockLabel" value={form.stockLabel} onChange={(e) => set("stockLabel", e.target.value)} placeholder={s.stockLabel ?? "مثال: قطعتان متبقيتان"} />
              <SyncedHint source={s.stockLabel} />
            </div>
          </FormField>
          <FormField label="رابط الصورة الرئيسية" htmlFor="image">
            <div className="space-y-1">
              <Input id="image" dir="ltr" value={form.image} onChange={(e) => set("image", e.target.value)} placeholder={s.image} />
              <SyncedHint source={s.image} />
            </div>
          </FormField>
          <FormField label="الأيقونة (للمنتجات الرقمية)" htmlFor="icon">
            <div className="space-y-1">
              <Input id="icon" dir="ltr" value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder={s.icon} />
              <SyncedHint source={s.icon} />
            </div>
          </FormField>
          <div className="md:col-span-2">
            <FormField label="الوصف" htmlFor="description">
              <Textarea id="description" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={s.description} />
            </FormField>
          </div>
          <FormField label="الاسم (بالعربية)" htmlFor="nameAr">
            <div className="space-y-1">
              <Input id="nameAr" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} placeholder={s.nameAr} />
              <SyncedHint source={s.nameAr} />
            </div>
          </FormField>
          <FormField label="الوصف (بالعربية)" htmlFor="descriptionAr">
            <Textarea id="descriptionAr" rows={3} value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} placeholder={s.descriptionAr} />
          </FormField>
        </div>
      </SectionCard>

      {s.images.length > 0 && (
        <SectionCard title="الصور المُزامنة">
          <div className="flex flex-wrap gap-2">
            {s.images.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="h-16 w-16 rounded-lg border border-[#e2e8f0] object-cover"
              />
            ))}
          </div>
        </SectionCard>
      )}

      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={() => run(status)}>
          <Save className="h-4 w-4" />
          {busy ? "جاري الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>
    </div>
  );
}
