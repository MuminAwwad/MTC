"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField, SectionCard } from "@/components/shared";
import type { Category, Supplier, Product } from "@prisma/client";

interface ProductFormProps {
  initialData?: Partial<Product>;
  isEdit?: boolean;
  /** Called with the updated product after a successful save.
   *  The detail page uses this to swap its local state + exit edit mode,
   *  since router.refresh() doesn't reload its client-side product state. */
  onSuccess?: (saved: Product) => void;
}

export function ProductForm({ initialData, isEdit, onSuccess }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [existingProductId, setExistingProductId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSaving, setNewCatSaving] = useState(false);
  const [newCatError, setNewCatError] = useState("");
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descError, setDescError] = useState("");
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [searchingImages, setSearchingImages] = useState(false);
  const [imageCandidates, setImageCandidates] = useState<
    Array<{ imageUrl: string; sourceTitle: string; sourceUri: string }> | null
  >(null);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [adoptingUrl, setAdoptingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const createCategory = async () => {
    if (!newCatName.trim()) { setNewCatError("الاسم مطلوب"); return; }
    setNewCatSaving(true);
    setNewCatError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setNewCatError(data.error ?? "تعذر إنشاء الفئة"); return; }
      setCategories((cs) => [...cs, data]);
      setForm((f) => ({ ...f, categoryId: data.id }));
      setNewCatName("");
      setNewCatOpen(false);
    } catch {
      setNewCatError("خطأ في الاتصال");
    } finally {
      setNewCatSaving(false);
    }
  };

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

  const generateDescription = async () => {
    if (!form.name.trim()) return;
    setGeneratingDesc(true);
    setDescError("");
    try {
      const res = await fetch("/api/products/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setDescError(data.error ?? "تعذّر توليد الوصف"); return; }
      set("description", data.description as string);
    } catch {
      setDescError("خطأ في الاتصال");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const uploadImages = async (files: FileList) => {
    setUploadingImage(true);
    setImageError("");
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/products/images", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) { setImageError(data.error ?? "تعذّر رفع الصورة"); continue; }
        setImages((imgs) => [...imgs, data.url as string]);
      }
    } catch {
      setImageError("خطأ في الاتصال");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async (url: string) => {
    setImages((imgs) => imgs.filter((u) => u !== url));
    fetch("/api/products/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {});
  };

  const searchImages = async () => {
    if (!form.name.trim()) return;
    setSearchingImages(true);
    setImageError("");
    setImageCandidates(null);
    try {
      const res = await fetch("/api/products/find-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setImageError(data.error ?? "تعذّر البحث عن صور"); return; }
      const candidates = data.candidates as Array<{ imageUrl: string; sourceTitle: string; sourceUri: string }>;
      if (candidates.length === 0) { setImageError("لم يتم العثور على صور مناسبة لهذا المنتج"); return; }
      setImageCandidates(candidates);
      setCandidatesOpen(true);
    } catch {
      setImageError("خطأ في الاتصال");
    } finally {
      setSearchingImages(false);
    }
  };

  const adoptCandidate = async (imageUrl: string) => {
    setAdoptingUrl(imageUrl);
    try {
      const res = await fetch("/api/products/images/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setImageError(data.error ?? "تعذّر استخدام هذه الصورة"); return; }
      setImages((imgs) => [...imgs, data.url as string]);
      setImageCandidates((cs) => cs?.filter((c) => c.imageUrl !== imageUrl) ?? null);
    } catch {
      setImageError("خطأ في الاتصال");
    } finally {
      setAdoptingUrl(null);
    }
  };

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
      images,
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

      if (isEdit && onSuccess) {
        onSuccess(data as Product);
      } else {
        router.push(`/inventory/${data.id}`);
        router.refresh();
      }
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
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  value={form.categoryId || "__none__"}
                  onValueChange={(v) => set("categoryId", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون فئة</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setNewCatOpen(true)}
                title="إضافة فئة جديدة"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </FormField>

          <FormField label="المورد" htmlFor="supplier">
            <Select
              value={form.supplierId || "__none__"}
              onValueChange={(v) => set("supplierId", v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر المورد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بدون مورد</SelectItem>
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

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">وصف المنتج</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-[#104e98] hover:text-[#0b3d7a]"
                onClick={generateDescription}
                disabled={!form.name.trim() || generatingDesc}
                title={!form.name.trim() ? "أدخل اسم المنتج أولًا" : undefined}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {generatingDesc ? "جاري البحث والتوليد..." : "إنشاء بالذكاء الاصطناعي"}
              </Button>
            </div>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="وصف اختياري... أو اضغط «إنشاء بالذكاء الاصطناعي» لتوليده تلقائيًا"
              rows={5}
            />
            {descError && <p className="text-xs text-[#ef4444]">{descError}</p>}
          </div>
        </div>
      </SectionCard>

      {/* Images */}
      <SectionCard title="صور المنتج">
        <div className="space-y-3">
          {images.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {images.map((url) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-[#e2e8f0] bg-[#f8fafc] group">
                  {/* eslint-disable-next-line @next/next/no-img-element -- externally-hosted Blob URLs, not worth next/image's remote-pattern config for this internal admin form */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(url)}
                    className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="حذف الصورة"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadImages(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
            >
              <Upload className="h-4 w-4" />
              {uploadingImage ? "جاري الرفع..." : "رفع صورة"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-[#104e98]"
              onClick={searchImages}
              disabled={!form.name.trim() || searchingImages}
              title={!form.name.trim() ? "أدخل اسم المنتج أولًا" : undefined}
            >
              <Sparkles className="h-4 w-4" />
              {searchingImages ? "جاري البحث..." : "اقتراح صور من الإنترنت"}
            </Button>
          </div>
          {imageError && <p className="text-xs text-[#ef4444]">{imageError}</p>}
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

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
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

      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>فئة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="اسم الفئة" required>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="مثال: شواحن، حافظات..."
                autoFocus
              />
            </FormField>
            {newCatError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{newCatError}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewCatOpen(false)} disabled={newCatSaving}>
              إلغاء
            </Button>
            <Button type="button" onClick={createCategory} disabled={newCatSaving || !newCatName.trim()}>
              {newCatSaving ? "جاري الحفظ..." : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>صور مقترحة من الإنترنت</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            هذه الصور من مواقع خارجية (نتائج بحث). تأكد من حقوق استخدامها قبل نشرها للعامة.
          </p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {(imageCandidates ?? []).length === 0 ? (
              <p className="text-sm text-[#64748b] text-center py-4">تم استخدام كل الصور المقترحة</p>
            ) : (
              imageCandidates!.map((c) => (
                <div key={c.imageUrl} className="flex items-center gap-3 border border-[#e2e8f0] rounded-lg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, preview only */}
                  <img src={c.imageUrl} alt="" className="w-16 h-16 object-cover rounded-md flex-shrink-0 bg-[#f8fafc]" />
                  <div className="flex-1 min-w-0">
                    <a href={c.sourceUri} target="_blank" rel="noopener noreferrer" className="text-xs text-[#104e98] hover:underline truncate block">
                      {c.sourceTitle}
                    </a>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => adoptCandidate(c.imageUrl)}
                    disabled={adoptingUrl === c.imageUrl}
                  >
                    {adoptingUrl === c.imageUrl ? "جاري الإضافة..." : "استخدم هذه الصورة"}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCandidatesOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
