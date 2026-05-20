"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, FileText, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionCard, FormField, useToast } from "@/components/shared";

interface ParsedItem {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  sku: string | null;
  sellPrice: number;
}

interface ParsedInvoice {
  supplier: { name: string; phone: string; company: string };
  items: ParsedItem[];
  invoiceNumber: string;
  invoiceDate: string;
}

let counter = 0;
const newItem = (): ParsedItem => ({
  id: `it-${++counter}`,
  name: "",
  qty: 1,
  unitCost: 0,
  sku: null,
  sellPrice: 0,
});

export default function InventoryImportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState<ParsedInvoice | null>(null);

  const onFile = async (file: File) => {
    setError("");
    setFileName(file.name);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inventory/import/parse", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "فشل تحليل الملف");
        return;
      }
      // Normalize into the editable shape
      setData({
        supplier: {
          name: body.supplier?.name ?? "",
          phone: body.supplier?.phone ?? "",
          company: body.supplier?.company ?? "",
        },
        items: (body.items ?? []).map((it: { name: string; qty: number; unitCost: number; sku: string | null }) => ({
          id: `it-${++counter}`,
          name: it.name,
          qty: it.qty || 1,
          unitCost: Number(it.unitCost) || 0,
          sku: it.sku,
          sellPrice: Number(it.unitCost) || 0,
        })),
        invoiceNumber: body.invoiceNumber ?? "",
        invoiceDate: body.invoiceDate ?? "",
      });
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setParsing(false);
    }
  };

  const updateItem = (id: string, field: keyof ParsedItem, value: string | number | null) => {
    if (!data) return;
    setData({ ...data, items: data.items.map((it) => (it.id === id ? { ...it, [field]: value } : it)) });
  };
  const addItem = () => data && setData({ ...data, items: [...data.items, newItem()] });
  const removeItem = (id: string) => data && setData({ ...data, items: data.items.filter((it) => it.id !== id) });

  const commit = async () => {
    if (!data) return;
    if (!data.supplier.name.trim()) { setError("اسم المورد مطلوب"); return; }
    const validItems = data.items.filter((it) => it.name.trim());
    if (validItems.length === 0) { setError("لا توجد عناصر صالحة"); return; }
    setCommitting(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: {
            name: data.supplier.name.trim(),
            phone: data.supplier.phone.trim() || null,
            company: data.supplier.company.trim() || null,
          },
          items: validItems.map((it) => ({
            name: it.name.trim(),
            qty: it.qty,
            unitCost: it.unitCost,
            sku: it.sku?.trim() || null,
            sellPrice: it.sellPrice,
          })),
          invoiceNumber: data.invoiceNumber.trim() || null,
          invoiceDate: data.invoiceDate.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "فشل الحفظ");
        return;
      }
      toast(`تمت إضافة ${validItems.length} عنصر للمخزون`);
      router.push("/inventory");
      router.refresh();
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setCommitting(false);
    }
  };

  const itemsTotal = data?.items.reduce((s, it) => s + it.qty * it.unitCost, 0) ?? 0;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="استيراد فاتورة شراء"
        subtitle="ارفع صورة الفاتورة أو ملف PDF أو xlsx وسيستخرج النظام البيانات تلقائيًا"
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "المخزون", href: "/inventory" },
          { label: "استيراد فاتورة" },
        ]}
      />

      {!data && (
        <SectionCard>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#cbd5e1] rounded-xl p-10 text-center cursor-pointer hover:border-[#104e98] hover:bg-[#f8fafc] transition-colors"
          >
            <Upload className="h-10 w-10 text-[#94a3b8] mx-auto mb-3" />
            <p className="text-sm font-medium text-[#1e293b] mb-1">
              اضغط لاختيار ملف، أو اسحب الملف هنا
            </p>
            <p className="text-xs text-[#64748b]">
              صورة (JPG / PNG) · PDF · xlsx — حتى 10 ميجابايت
            </p>
            {parsing && (
              <p className="text-sm text-[#104e98] mt-4 flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                جاري قراءة الفاتورة بالذكاء الاصطناعي...
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {fileName && !parsing && !data && (
            <p className="mt-3 text-xs text-[#64748b] flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {fileName}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </SectionCard>
      )}

      {data && (
        <>
          <div className="text-xs text-[#64748b] flex items-center gap-2 -mt-3">
            <Sparkles className="h-3.5 w-3.5 text-[#104e98]" />
            تم استخراج البيانات من <span className="font-medium">{fileName}</span>. راجع وعدّل قبل التأكيد.
          </div>

          <SectionCard title="بيانات المورد">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="اسم المورد" required>
                <Input
                  value={data.supplier.name}
                  onChange={(e) => setData({ ...data, supplier: { ...data.supplier, name: e.target.value } })}
                  placeholder="اسم المورد"
                />
              </FormField>
              <FormField label="رقم الهاتف">
                <Input
                  value={data.supplier.phone}
                  onChange={(e) => setData({ ...data, supplier: { ...data.supplier, phone: e.target.value } })}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                />
              </FormField>
              <FormField label="اسم الشركة">
                <Input
                  value={data.supplier.company}
                  onChange={(e) => setData({ ...data, supplier: { ...data.supplier, company: e.target.value } })}
                />
              </FormField>
              <FormField label="رقم الفاتورة">
                <Input
                  value={data.invoiceNumber}
                  onChange={(e) => setData({ ...data, invoiceNumber: e.target.value })}
                  dir="ltr"
                />
              </FormField>
            </div>
          </SectionCard>

          <SectionCard title={`الأصناف (${data.items.length})`}>
            <div className="space-y-3">
              <div className="hidden md:grid grid-cols-[2fr_120px_80px_120px_120px_36px] gap-2 px-1 text-xs font-medium text-[#64748b]">
                <span>الصنف</span>
                <span>SKU</span>
                <span>الكمية</span>
                <span>سعر التكلفة</span>
                <span>سعر البيع</span>
                <span></span>
              </div>
              {data.items.map((it) => (
                <div key={it.id} className="grid grid-cols-1 md:grid-cols-[2fr_120px_80px_120px_120px_36px] gap-2 items-center">
                  <Input
                    value={it.name}
                    onChange={(e) => updateItem(it.id, "name", e.target.value)}
                    placeholder="اسم الصنف"
                    className="text-sm"
                  />
                  <Input
                    value={it.sku ?? ""}
                    onChange={(e) => updateItem(it.id, "sku", e.target.value || null)}
                    placeholder="SKU"
                    className="text-sm"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={it.qty}
                    onChange={(e) => updateItem(it.id, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-sm"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.unitCost}
                    onChange={(e) => updateItem(it.id, "unitCost", parseFloat(e.target.value) || 0)}
                    className="text-sm"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.sellPrice}
                    onChange={(e) => updateItem(it.id, "sellPrice", parseFloat(e.target.value) || 0)}
                    className="text-sm"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="p-1.5 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-[#104e98] hover:underline font-medium pt-1"
              >
                <Plus className="h-4 w-4" />
                صنف يدوي
              </button>
            </div>
          </SectionCard>

          <div className="flex items-center justify-between bg-[#f8fafc] rounded-xl p-4">
            <span className="text-sm text-[#64748b]">الإجمالي الذي سيُسجَّل كمستحق على المورد</span>
            <span className="font-bold text-[#0b2345] ltr">₪{itemsTotal.toFixed(2)}</span>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setData(null); setFileName(""); setError(""); }} disabled={committing}>
              إلغاء
            </Button>
            <Button onClick={commit} disabled={committing}>
              {committing ? "جاري الحفظ..." : "تأكيد وإضافة للمخزون"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
