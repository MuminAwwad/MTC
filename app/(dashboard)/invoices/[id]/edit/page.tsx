"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, ArrowRight, Pencil, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PageHeader,
  SectionCard,
  FormField,
  LoadingSkeleton,
  CustomerSelector,
  useToast,
} from "@/components/shared";
import { ProductLineSelector } from "@/components/invoices/ProductLineSelector";
import { CURRENCY_LABELS } from "@/lib/constants";
import type { Currency, InvoiceStatus } from "@prisma/client";

type ItemSource = "SALE" | "TICKET_PART" | "TICKET_LABOR";

interface LineItem {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  source: ItemSource;
}

interface LoadedInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: Currency;
  discountAmount: number;
  discountPercent: number;
  taxPercent: number;
  deliveryFee: number;
  notes: string | null;
  paidAmount: number;
  ticketId: string | null;
  customer: { id: string; name: string };
  items: Array<{
    id: string;
    productId: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    source: ItemSource;
  }>;
  debts: Array<{ id: string; dueDate: string | null; notes: string | null }>;
}

let counter = 0;
const newRow = (source: ItemSource = "SALE"): LineItem => ({
  id: `item-${++counter}`,
  productId: null,
  name: "",
  qty: 1,
  unitPrice: 0,
  discount: 0,
  source,
});

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const { toast } = useToast();

  const [loaded, setLoaded] = useState<LoadedInvoice | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [notes, setNotes] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtNotes, setDebtNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) {
        setError("تعذّر تحميل الفاتورة");
        return;
      }
      const data = (await res.json()) as LoadedInvoice;
      setLoaded(data);
      setCustomerId(data.customer.id);
      setItems(
        data.items.length > 0
          ? data.items.map((i) => ({
              id: `item-${++counter}`,
              productId: i.productId,
              name: i.name,
              qty: i.qty,
              unitPrice: Number(i.unitPrice),
              discount: Number(i.discount),
              source: i.source,
            }))
          : [newRow()]
      );
      setDiscountPercent(Number(data.discountPercent));
      setDiscountAmount(Number(data.discountAmount));
      setTaxPercent(Number(data.taxPercent));
      setDeliveryFee(Number(data.deliveryFee ?? 0));
      setNotes(data.notes ?? "");
      const debt = data.debts[0];
      if (debt) {
        setDebtDueDate(debt.dueDate ? debt.dueDate.slice(0, 10) : "");
        setDebtNotes(debt.notes ?? "");
      }
    })();
  }, [invoiceId]);

  const updateItem = useCallback(
    (id: string, field: keyof LineItem, value: string | number | null) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }, []);

  const addProductLine = useCallback(
    (product: { id: string; name: string; sellPrice: number }) => {
      setItems((prev) => {
        const empty = prev.find((i) => i.source === "SALE" && !i.name && i.unitPrice === 0);
        if (empty) {
          return prev.map((i) =>
            i.id === empty.id
              ? {
                  ...i,
                  productId: product.id,
                  name: product.name,
                  unitPrice: Number(product.sellPrice),
                }
              : i
          );
        }
        return [
          ...prev,
          {
            id: `item-${++counter}`,
            productId: product.id,
            name: product.name,
            qty: 1,
            unitPrice: Number(product.sellPrice),
            discount: 0,
            source: "SALE" as const,
          },
        ];
      });
    },
    []
  );

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0);
  const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
  const taxable = subtotal - discAmt;
  const taxAmt = taxPercent > 0 ? taxable * (taxPercent / 100) : 0;
  const total = taxable + taxAmt + deliveryFee;
  const paid = loaded ? Number(loaded.paidAmount) : 0;
  const remaining = Math.max(0, total - paid);
  const willOweCustomer = remaining > 0 && loaded?.status !== "DRAFT";
  // Block save when the new total would be below what's already been collected
  // — the API would reject it anyway, this just surfaces the issue earlier.
  const exceedsPaid = total < paid;

  const save = async () => {
    if (!loaded) return;
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) {
      setError("يجب إضافة منتج واحد على الأقل");
      return;
    }
    if (!customerId) {
      setError("يجب اختيار العميل");
      return;
    }
    if (exceedsPaid) {
      setError(
        `الإجمالي الجديد (₪${total.toFixed(2)}) أقل من المبلغ المدفوع (₪${paid.toFixed(2)})`
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(customerId && customerId !== loaded.customer.id
            ? { customerId }
            : {}),
          items: valid.map((i) => ({
            productId: i.productId ?? undefined,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
            discount: i.discount,
            source: i.source,
          })),
          discountAmount,
          discountPercent,
          taxPercent,
          deliveryFee,
          notes,
          ...(willOweCustomer
            ? {
                debt: {
                  dueDate: debtDueDate || null,
                  notes: debtNotes || null,
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        toast(data.error ?? "حدث خطأ", "error");
        return;
      }
      toast("تم تحديث الفاتورة");
      router.push(`/invoices/${invoiceId}`);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <LoadingSkeleton />;
  // Customer swap is blocked when the invoice came from a maintenance ticket
  // (the ticket belongs to the original customer and we don't want a mismatch).
  const customerLocked = !!loaded.ticketId;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={`تعديل ${loaded.invoiceNumber}`}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الفواتير", href: "/invoices" },
          { label: loaded.invoiceNumber, href: `/invoices/${invoiceId}` },
          { label: "تعديل" },
        ]}
      />

      {loaded.status !== "DRAFT" && (
        <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
          <span>
            هذه الفاتورة صادرة بالفعل. تعديل الأصناف أو الأسعار سيعدّل المخزون والديون
            تلقائيًا. لا يمكن تخفيض الإجمالي عن المبلغ المدفوع.
          </span>
        </div>
      )}

      <SectionCard title="بيانات الفاتورة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="العميل" required>
            {customerLocked ? (
              <div className="space-y-1">
                <div className="h-10 px-3 flex items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-sm text-[#0b2345]">
                  {loaded.customer.name}
                </div>
                <p className="text-xs text-[#94a3b8]">
                  لا يمكن تغيير العميل لأن الفاتورة مرتبطة بتذكرة صيانة.
                </p>
              </div>
            ) : (
              <CustomerSelector value={customerId} onChange={(id) => setCustomerId(id)} />
            )}
            <Link
              href={`/customers/${customerId || loaded.customer.id}`}
              target="_blank"
              className="mt-1 inline-flex items-center gap-1 text-xs text-[#104e98] hover:underline"
            >
              <Pencil className="h-3 w-3" />
              تعديل بيانات العميل
              <ExternalLink className="h-3 w-3" />
            </Link>
          </FormField>
          <FormField label="العملة">
            <div className="h-10 px-3 flex items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-sm text-[#0b2345]">
              {CURRENCY_LABELS[loaded.currency]}
            </div>
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="الأصناف">
        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-[2fr_80px_120px_100px_100px_36px] gap-2 px-1 text-xs font-medium text-[#64748b]">
            <span>الصنف</span>
            <span>الكمية</span>
            <span>سعر الوحدة</span>
            <span>الخصم</span>
            <span>الإجمالي</span>
            <span></span>
          </div>

          {items.map((item) => {
            const lineTotal = item.qty * item.unitPrice - item.discount;
            return (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_80px_120px_100px_100px_36px] gap-2 items-center"
              >
                <Input
                  value={item.name}
                  onChange={(e) => updateItem(item.id, "name", e.target.value)}
                  placeholder="اسم الصنف"
                  className="text-sm"
                />
                <Input
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) =>
                    updateItem(item.id, "qty", Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="text-sm"
                  dir="ltr"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) =>
                    updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)
                  }
                  className="text-sm"
                  dir="ltr"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.discount}
                  onChange={(e) =>
                    updateItem(item.id, "discount", parseFloat(e.target.value) || 0)
                  }
                  className="text-sm"
                  dir="ltr"
                />
                <div className="text-sm font-medium text-[#0b2345] ltr text-left px-1">
                  ₪{lineTotal.toFixed(2)}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50"
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <div className="pt-2 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <ProductLineSelector onSelect={addProductLine} />
            <button
              type="button"
              onClick={() => setItems((p) => [...p, newRow()])}
              className="flex items-center gap-1.5 text-sm text-[#104e98] hover:underline font-medium"
            >
              <Plus className="h-4 w-4" />
              صنف يدوي
            </button>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="الخصم والضريبة">
          <div className="space-y-3">
            <FormField label="نسبة الخصم (%)">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercent}
                onChange={(e) => {
                  setDiscountPercent(parseFloat(e.target.value) || 0);
                  setDiscountAmount(0);
                }}
                dir="ltr"
              />
            </FormField>
            <FormField label="مبلغ الخصم (₪)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => {
                  setDiscountAmount(parseFloat(e.target.value) || 0);
                  setDiscountPercent(0);
                }}
                dir="ltr"
              />
            </FormField>
            <FormField label="الضريبة (%)">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxPercent}
                onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                dir="ltr"
              />
            </FormField>
            <FormField label="رسوم التوصيل (₪)">
              <div className="space-y-2">
                <div className="flex gap-1 bg-[#f1f5f9] rounded-lg p-1">
                  {[
                    { label: "الضفة", value: 25 },
                    { label: "القدس", value: 35 },
                    { label: "الداخل", value: 80 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDeliveryFee(preset.value)}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-md font-medium transition-all ${
                        deliveryFee === preset.value
                          ? "bg-white text-[#104e98] shadow-sm"
                          : "text-[#64748b] hover:text-[#1e293b]"
                      }`}
                    >
                      {preset.label} <span className="ltr text-[#94a3b8]">₪{preset.value}</span>
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0 (لا توصيل) أو مبلغ مخصص"
                  dir="ltr"
                />
              </div>
            </FormField>
          </div>

          {willOweCustomer && (
            <div className="mt-4 p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-[#0b2345]">تفاصيل الدين</h4>
              <p className="text-xs text-[#64748b]">
                تبقّى مبلغ مستحق على العميل بعد التعديل. يمكنك تحديث تاريخ الاستحقاق والملاحظات.
              </p>
              <FormField label="تاريخ الاستحقاق">
                <Input
                  type="date"
                  value={debtDueDate}
                  onChange={(e) => setDebtDueDate(e.target.value)}
                  dir="ltr"
                />
              </FormField>
              <FormField label="ملاحظات الدين">
                <Textarea
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  rows={2}
                />
              </FormField>
            </div>
          )}
        </SectionCard>

        <SectionCard title="ملخص الفاتورة">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#64748b]">المجموع الفرعي</dt>
              <dd className="font-medium ltr">₪{subtotal.toFixed(2)}</dd>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-red-600">
                <dt>الخصم</dt>
                <dd className="ltr">- ₪{discAmt.toFixed(2)}</dd>
              </div>
            )}
            {taxAmt > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#64748b]">الضريبة ({taxPercent}%)</dt>
                <dd className="ltr">₪{taxAmt.toFixed(2)}</dd>
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#64748b]">رسوم التوصيل</dt>
                <dd className="ltr">₪{deliveryFee.toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#e2e8f0] text-base font-bold text-[#0b2345]">
              <dt>الإجمالي</dt>
              <dd className="ltr">₪{total.toFixed(2)}</dd>
            </div>
            {paid > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <dt>مدفوع</dt>
                  <dd className="ltr">₪{paid.toFixed(2)}</dd>
                </div>
                <div
                  className={`flex justify-between font-medium ${
                    exceedsPaid ? "text-red-600" : "text-orange-600"
                  }`}
                >
                  <dt>{exceedsPaid ? "زيادة في الدفع" : "المتبقي"}</dt>
                  <dd className="ltr">
                    {exceedsPaid
                      ? `- ₪${(paid - total).toFixed(2)}`
                      : `₪${remaining.toFixed(2)}`}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </SectionCard>
      </div>

      <SectionCard>
        <FormField label="ملاحظات">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </FormField>
      </SectionCard>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div
        className="
          sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0
          bg-white/95 sm:bg-transparent backdrop-blur sm:backdrop-blur-0
          border-t border-[#e2e8f0] sm:border-0
          pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-8
          flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3
          z-10
        "
      >
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          إلغاء
        </Button>
        <Button onClick={save} disabled={saving || exceedsPaid} className="gap-2">
          {saving ? "جاري الحفظ..." : (<>حفظ التعديلات <ArrowRight className="h-4 w-4 rotate-180" /></>)}
        </Button>
      </div>
    </div>
  );
}
