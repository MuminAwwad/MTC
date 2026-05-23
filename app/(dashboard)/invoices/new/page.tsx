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

type ItemSource = "SALE" | "TICKET_PART" | "TICKET_LABOR";

interface TicketPart {
  name: string;
  productId?: string | null;
  qty: number;
  unitCost: number;
}

interface UnbilledTicket {
  id: string;
  ticketNumber: string;
  status: string;
  finalCost: number | null;
  deviceLabel: string;
}

interface LineItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  source: ItemSource;
}

let itemCounter = 0;
function newItem(source: ItemSource = "SALE"): LineItem {
  return { id: `item-${++itemCounter}`, productId: "", name: "", qty: 1, unitPrice: 0, discount: 0, source };
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
  // Default to "not a debt" (fully paid in cash). The checkbox flips this
  // and reveals the debt-specific fields (deposit, due date, notes).
  const [isDebt, setIsDebt] = useState(false);
  const [partialPaid, setPartialPaid] = useState(0);
  const [debtDueDate, setDebtDueDate] = useState("");
  const [debtNotes, setDebtNotes] = useState("");
  const [loading, setLoading] = useState<"draft" | "issue" | null>(null);
  const [error, setError] = useState("");
  const [attachedTicket, setAttachedTicket] = useState<{ id: string; ticketNumber: string } | null>(null);
  // Tickets owned by the chosen customer that are not yet linked to any invoice.
  // The ticket picker dropdown reads from this list; once a ticket is attached
  // it stays in the list (selected) so it shows in the dropdown.
  const [unbilledTickets, setUnbilledTickets] = useState<UnbilledTicket[]>([]);

  const attachTicket = useCallback(async (tid: string) => {
    const res = await fetch(`/api/tickets/${tid}`);
    if (!res.ok) return;
    const t = await res.json();
    const parts: TicketPart[] = t.parts ?? [];
    const partsTotal = parts.reduce((s, p) => s + p.qty * Number(p.unitCost), 0);
    const finalCost = Number(t.finalCost ?? 0);
    const deposit = Number(t.depositPaid ?? 0);
    const laborCost = Math.max(0, finalCost - partsTotal);
    const ticketLines: LineItem[] = parts.map((p) => ({
      id: `item-${++itemCounter}`,
      productId: p.productId ?? "",
      name: p.name,
      qty: p.qty,
      unitPrice: Number(p.unitCost),
      discount: 0,
      source: "TICKET_PART" as const,
    }));
    if (laborCost > 0 || ticketLines.length === 0) {
      ticketLines.push({
        id: `item-${++itemCounter}`,
        productId: "",
        name: `أجور صيانة (${t.ticketNumber})`,
        qty: 1,
        unitPrice: laborCost,
        discount: 0,
        source: "TICKET_LABOR" as const,
      });
    }
    setItems((prev) => {
      const saleItems = prev.filter((i) => i.source === "SALE");
      // Drop empty placeholder SALE rows when attaching a ticket
      const cleanedSale = saleItems.filter((i) => i.name.trim() || i.unitPrice > 0);
      return [...cleanedSale, ...ticketLines];
    });
    if (deposit > 0) {
      // Ticket already collected a deposit — flip into "debt" mode and
      // pre-fill the deposit as the amount paid up-front.
      setIsDebt(true);
      setPartialPaid((cur) => cur + deposit);
    }
    setAttachedTicket({ id: t.id, ticketNumber: t.ticketNumber });
  }, []);

  // Auto-attach when arriving with ?ticketId=...
  useEffect(() => {
    if (!ticketId) return;
    attachTicket(ticketId);
  }, [ticketId, attachTicket]);

  // Fetch the customer's unbilled (no invoice linked) non-cancelled tickets.
  // Refreshed whenever the customer changes — even if a ticket is currently
  // attached, the list stays in sync.
  useEffect(() => {
    if (!customerId) { setUnbilledTickets([]); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/tickets?customerId=${customerId}&unbilled=true&all=true`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const list: UnbilledTicket[] = (data.tickets ?? [])
        .filter((t: { status: string }) => t.status !== "CANCELLED")
        .map((t: { id: string; ticketNumber: string; status: string; finalCost?: number | null; deviceBrand?: string | null; deviceModel?: string | null }) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          status: t.status,
          finalCost: t.finalCost ?? null,
          deviceLabel: [t.deviceBrand, t.deviceModel].filter(Boolean).join(" "),
        }));
      setUnbilledTickets(list);
    })();
    return () => { cancelled = true; };
  }, [customerId]);

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
      const empty = prev.find((i) => i.source === "SALE" && !i.name && i.unitPrice === 0);
      if (empty) {
        return prev.map((i) =>
          i.id === empty.id
            ? { ...i, productId: product.id, name: product.name, unitPrice: Number(product.sellPrice) }
            : i
        );
      }
      return [...prev, { id: `item-${++itemCounter}`, productId: product.id, name: product.name, qty: 1, unitPrice: Number(product.sellPrice), discount: 0, source: "SALE" as const }];
    });
  }, []);

  const detachTicket = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.source === "SALE"));
    setAttachedTicket(null);
  }, []);

  const saleItems = items.filter((i) => i.source === "SALE");
  const ticketItems = items.filter((i) => i.source !== "SALE");
  const saleSubtotal = saleItems.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0);
  const ticketSubtotal = ticketItems.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0);

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unitPrice - i.discount, 0);
  const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
  const taxable = subtotal - discAmt;
  const taxAmt = taxPercent > 0 ? taxable * (taxPercent / 100) : 0;
  const total = taxable + taxAmt;
  // Not-debt invoices are fully paid. Debt invoices use whatever the
  // customer paid as a deposit (defaults to 0) and the rest becomes the debt.
  const paidAmount = isDebt ? Math.min(total, partialPaid) : total;
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
            source: i.source,
          })),
          discountAmount,
          discountPercent,
          taxPercent,
          currency,
          notes,
          status,
          paidAmount,
          ticketId: attachedTicket?.id ?? undefined,
          ...(isDebt && remaining > 0
            ? {
                debt: {
                  dueDate: debtDueDate || undefined,
                  notes: debtNotes || undefined,
                },
              }
            : {}),
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
        title={attachedTicket ? `فاتورة جديدة + تذكرة ${attachedTicket.ticketNumber}` : "فاتورة جديدة"}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الفواتير", href: "/invoices" },
          { label: "فاتورة جديدة" },
        ]}
      />

      {/* Customer + Currency + Repair-ticket picker */}
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

        {customerId && (
          <div className="mt-4">
            <FormField label="تذكرة صيانة (اختياري)" htmlFor="ticket-pick">
              <select
                id="ticket-pick"
                value={attachedTicket?.id ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    if (attachedTicket) detachTicket();
                  } else if (val !== attachedTicket?.id) {
                    if (attachedTicket) detachTicket();
                    attachTicket(val);
                  }
                }}
                disabled={unbilledTickets.length === 0 && !attachedTicket}
                className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
              >
                <option value="">
                  {unbilledTickets.length === 0
                    ? "لا توجد تذاكر صيانة غير مفوترة لهذا العميل"
                    : "بدون — فاتورة بيع فقط"}
                </option>
                {unbilledTickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ticketNumber}
                    {t.deviceLabel ? ` — ${t.deviceLabel}` : ""}
                    {t.finalCost != null ? ` — ₪${Number(t.finalCost).toFixed(2)}` : ""}
                  </option>
                ))}
              </select>
            </FormField>
            {attachedTicket && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-orange-700">
                <Wrench className="h-3.5 w-3.5" />
                إصدار الفاتورة سيُسلِّم التذكرة{" "}
                <span className="ltr font-semibold">{attachedTicket.ticketNumber}</span> تلقائيًا.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Sale items */}
      <SectionCard title={attachedTicket ? `أصناف البيع · ₪${saleSubtotal.toFixed(2)}` : "الأصناف"}>
        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-[2fr_80px_120px_100px_100px_36px] gap-2 px-1 text-xs font-medium text-[#64748b]">
            <span>الصنف</span>
            <span>الكمية</span>
            <span>سعر الوحدة</span>
            <span>الخصم</span>
            <span>الإجمالي</span>
            <span></span>
          </div>

          {saleItems.map((item) => {
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

      {/* Ticket items section (read-only, only when a ticket is attached) */}
      {attachedTicket && ticketItems.length > 0 && (
        <SectionCard
          title={`أصناف الصيانة · ₪${ticketSubtotal.toFixed(2)}`}
          action={
            <span className="text-xs text-[#94a3b8] flex items-center gap-1 ltr">
              <Wrench className="h-3.5 w-3.5" />
              {attachedTicket.ticketNumber}
            </span>
          }
        >
          <div className="space-y-2 text-sm">
            {ticketItems.map((item) => {
              const lineTotal = item.qty * item.unitPrice - item.discount;
              return (
                <div key={item.id} className="grid grid-cols-[1fr_60px_100px_100px] gap-2 items-center py-1.5 border-b border-[#f8fafc] last:border-0">
                  <span className="text-[#1e293b] break-words">
                    {item.name}
                    {item.source === "TICKET_LABOR" && (
                      <span className="text-xs text-[#94a3b8] mr-1">(أجور)</span>
                    )}
                  </span>
                  <span className="text-center text-[#64748b]">{item.qty}</span>
                  <span className="ltr text-left text-[#64748b]">₪{item.unitPrice.toFixed(2)}</span>
                  <span className="ltr text-left font-medium text-[#0b2345]">₪{lineTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

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
          </div>

          <label className="flex items-center gap-3 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#cbd5e1] text-[#104e98] focus:ring-[#104e98]"
              checked={isDebt}
              onChange={(e) => setIsDebt(e.target.checked)}
            />
            <span className="text-sm font-medium text-[#1e293b]">
              هذه الفاتورة دين على العميل
            </span>
            <span className="text-xs text-[#64748b]">
              (سيتم تسجيل المتبقي كدين بدلًا من اعتبار الفاتورة مدفوعة)
            </span>
          </label>

          {isDebt && (
            <div className="mt-4 p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-[#0b2345]">تفاصيل الدين</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="المبلغ المدفوع الآن (₪)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={partialPaid}
                    onChange={(e) => setPartialPaid(Math.min(total, parseFloat(e.target.value) || 0))}
                    placeholder="0.00"
                    dir="ltr"
                  />
                </FormField>
                <FormField label="تاريخ الاستحقاق">
                  <Input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    dir="ltr"
                  />
                </FormField>
              </div>
              <FormField label="ملاحظات الدين (اختياري)">
                <Textarea
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  rows={2}
                  placeholder="مثال: اتفاق على سداد نصف الدين بعد أسبوعين"
                />
              </FormField>
              <dl className="grid grid-cols-3 gap-3 text-xs pt-2 border-t border-orange-200">
                <div>
                  <dt className="text-[#64748b]">إجمالي الفاتورة</dt>
                  <dd className="mt-0.5 font-semibold text-[#0b2345] ltr">₪{total.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-[#64748b]">المدفوع الآن</dt>
                  <dd className="mt-0.5 font-semibold text-green-600 ltr">₪{paidAmount.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-[#64748b]">الدين المتبقي</dt>
                  <dd className="mt-0.5 font-semibold text-orange-600 ltr">₪{remaining.toFixed(2)}</dd>
                </div>
              </dl>
            </div>
          )}
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
