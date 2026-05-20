"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, CustomerSelector, SectionCard, FormField } from "@/components/shared";
import { ProductLineSelector } from "@/components/invoices/ProductLineSelector";
import { CURRENCY_LABELS } from "@/lib/constants";
import type { Currency } from "@prisma/client";

interface LineItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

let itemCounter = 0;
function newItem(): LineItem {
  return { id: `item-${++itemCounter}`, productId: "", name: "", qty: 1, unitPrice: 0, discount: 0 };
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCustomer = searchParams.get("customerId") ?? "";
  const ticketId = searchParams.get("ticketId") ?? "";

  const [customerId, setCustomerId] = useState(initialCustomer);
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [currency, setCurrency] = useState<Currency>("ILS");
  const [notes, setNotes] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [loading, setLoading] = useState<"draft" | "issue" | null>(null);
  const [error, setError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketLoading, setTicketLoading] = useState(!!ticketId);

  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok || cancelled) { setTicketLoading(false); return; }
      const t = await res.json();
      setTicketNumber(t.ticketNumber);
      setCustomerId(t.customer.id);
      const parts: { name: string; productId?: string | null; qty: number; unitCost: number }[] = t.parts ?? [];
      const partsTotal = parts.reduce((s, p) => s + p.qty * Number(p.unitCost), 0);
      const finalCost = Number(t.finalCost ?? 0);
      const deposit = Number(t.depositPaid ?? 0);
      const laborCost = Math.max(0, finalCost - partsTotal);
      const lines: LineItem[] = [
        ...parts.map((p) => ({
          id: `item-${++itemCounter}`,
          productId: p.productId ?? "",
          name: p.name,
          qty: p.qty,
          unitPrice: Number(p.unitCost),
          discount: 0,
        })),
      ];
      if (laborCost > 0 || lines.length === 0) {
        lines.push({
          id: `item-${++itemCounter}`,
          productId: "",
          name: `أجور صيانة (${t.ticketNumber})`,
          qty: 1,
          unitPrice: laborCost,
          discount: 0,
        });
      }
      setItems(lines);
      setPaidAmount(deposit);
      setNotes(`فاتورة صيانة ${t.ticketNumber}`);
      setTicketLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ticketId]);

  const updateItem = useCallback((id: string, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }, []);

  const addProductLine = useCallback((product: { id: string; name: string; sellPrice: number }) => {
    setItems((prev) => {
      const empty = prev.find((i) => !i.name && i.unitPrice === 0);
      if (empty) {
        return prev.map((i) =>
          i.id === empty.id
            ? { ...i, productId: product.id, name: product.name, unitPrice: Number(product.sellPrice) }
            : i
        );
      }
      return [...prev, { id: `item-${++itemCounter}`, productId: product.id, name: product.name, qty: 1, unitPrice: Number(product.sellPrice), discount: 0 }];
    });
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unitPrice - i.discount, 0);
  const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
  const taxable = subtotal - discAmt;
  const taxAmt = taxPercent > 0 ? taxable * (taxPercent / 100) : 0;
  const total = taxable + taxAmt;
  const remaining = Math.max(0, total - paidAmount);

  const submit = async (status: "DRAFT" | "ISSUED") => {
    if (!customerId) { setError("يجب اختيار العميل"); return; }
    if (items.every((i) => !i.name)) { setError("يجب إضافة منتج واحد على الأقل"); return; }

    setLoading(status === "DRAFT" ? "draft" : "issue");
    setError("");
    try {
      const validItems = items.filter((i) => i.name.trim());
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          items: validItems.map((i) => ({
            productId: i.productId || undefined,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice,
            discount: i.discount,
          })),
          discountAmount,
          discountPercent,
          taxPercent,
          currency,
          notes,
          status,
          paidAmount,
          ticketId: ticketId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "حدث خطأ"); return; }
      router.push(`/invoices/${data.id}`);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={ticketNumber ? `فاتورة من تذكرة ${ticketNumber}` : "فاتورة جديدة"}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الفواتير", href: "/invoices" },
          { label: "فاتورة جديدة" },
        ]}
      />

      {ticketId && (
        <div className="flex items-center gap-2 text-sm bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-3 py-2">
          <Wrench className="h-4 w-4 flex-shrink-0" />
          <span>
            {ticketLoading
              ? "جاري تحميل بيانات التذكرة..."
              : `تم تعبئة القطع والأجور من التذكرة. إصدار الفاتورة سيُسلِّم التذكرة تلقائيًا.`}
          </span>
        </div>
      )}

      {/* Customer + Currency */}
      <SectionCard title="بيانات الفاتورة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="العميل" required>
            <CustomerSelector value={customerId} onChange={(id) => setCustomerId(id)} />
          </FormField>
          <FormField label="العملة" htmlFor="currency">
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
            >
              {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
                <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
              ))}
            </select>
          </FormField>
        </div>
      </SectionCard>

      {/* Line Items */}
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
              <div key={item.id} className="grid grid-cols-1 md:grid-cols-[2fr_80px_120px_100px_100px_36px] gap-2 items-center">
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
                  onChange={(e) => updateItem(item.id, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                  className="text-sm"
                  dir="ltr"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                  className="text-sm"
                  dir="ltr"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.discount}
                  onChange={(e) => updateItem(item.id, "discount", parseFloat(e.target.value) || 0)}
                  className="text-sm"
                  dir="ltr"
                />
                <div className="text-sm font-medium text-[#0b2345] ltr text-left px-1">
                  ₪{lineTotal.toFixed(2)}
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <div className="pt-2 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <ProductLineSelector onSelect={addProductLine} />
            <button
              onClick={() => setItems((p) => [...p, newItem()])}
              className="flex items-center gap-1.5 text-sm text-[#104e98] hover:underline font-medium"
            >
              <Plus className="h-4 w-4" />
              صنف يدوي
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Discounts & Tax */}
        <SectionCard title="الخصم والضريبة">
          <div className="space-y-3">
            <FormField label="نسبة الخصم (%)">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercent}
                onChange={(e) => { setDiscountPercent(parseFloat(e.target.value) || 0); setDiscountAmount(0); }}
                dir="ltr"
              />
            </FormField>
            <FormField label="مبلغ الخصم (₪)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountAmount}
                onChange={(e) => { setDiscountAmount(parseFloat(e.target.value) || 0); setDiscountPercent(0); }}
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
            <FormField label="المبلغ المدفوع مقدمًا (₪)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Math.min(total, parseFloat(e.target.value) || 0))}
                dir="ltr"
              />
            </FormField>
          </div>
        </SectionCard>

        {/* Summary */}
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
            <div className="flex justify-between pt-2 border-t border-[#e2e8f0] text-base font-bold text-[#0b2345]">
              <dt>الإجمالي</dt>
              <dd className="ltr">₪{total.toFixed(2)}</dd>
            </div>
            {paidAmount > 0 && (
              <>
                <div className="flex justify-between text-green-600">
                  <dt>مدفوع</dt>
                  <dd className="ltr">₪{paidAmount.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-orange-600 font-medium">
                  <dt>المتبقي</dt>
                  <dd className="ltr">₪{remaining.toFixed(2)}</dd>
                </div>
              </>
            )}
          </dl>
        </SectionCard>
      </div>

      {/* Notes */}
      <SectionCard>
        <FormField label="ملاحظات">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات تظهر على الفاتورة..."
            rows={3}
          />
        </FormField>
      </SectionCard>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end gap-3 pb-8">
        <Button variant="outline" onClick={() => router.back()} disabled={!!loading}>إلغاء</Button>
        <Button variant="outline" onClick={() => submit("DRAFT")} disabled={!!loading}>
          {loading === "draft" ? "جاري الحفظ..." : "حفظ كمسودة"}
        </Button>
        <Button onClick={() => submit("ISSUED")} disabled={!!loading}>
          {loading === "issue" ? "جاري الإصدار..." : "إصدار الفاتورة"}
        </Button>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoiceForm />
    </Suspense>
  );
}
