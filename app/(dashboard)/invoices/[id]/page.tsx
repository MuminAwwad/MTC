"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Printer, CreditCard, X, CheckCircle2, AlertCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusBadge, SectionCard, LoadingSkeleton, ConfirmDialog, CurrencyDisplay, useToast } from "@/components/shared";
import { INVOICE_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { buildInvoiceWhatsAppUrl } from "@/lib/whatsapp";
import type { InvoiceStatus, Currency } from "@prisma/client";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: Currency;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  notes: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null; address: string | null };
  items: Array<{
    id: string;
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    total: number;
    product: { id: string; name: string; sku: string | null } | null;
  }>;
  debts: Array<{
    id: string;
    amount: number;
    status: string;
    dueDate: string | null;
    payments: Array<{ id: string; amount: number; paidAt: string; note: string | null }>;
  }>;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${id}`);
    if (res.ok) setInvoice(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (newStatus: InvoiceStatus) => {
    setActionLoading(true);
    setError("");
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setInvoice(await res.json());
      setCancelConfirm(false);
      toast(newStatus === "ISSUED" ? "تم إصدار الفاتورة" : newStatus === "CANCELLED" ? "تم إلغاء الفاتورة" : "تم تحديث الحالة");
    } else { const d = await res.json(); setError(d.error ?? "حدث خطأ"); toast(d.error ?? "حدث خطأ", "error"); }
    setActionLoading(false);
  };

  const addPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    setPaying(true);
    setError("");
    const res = await fetch(`/api/invoices/${id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: paymentNote || undefined }),
    });
    if (res.ok) {
      setInvoice(await res.json());
      setShowPayment(false);
      setPaymentAmount("");
      setPaymentNote("");
      toast("تم تسجيل الدفعة بنجاح");
    } else {
      const d = await res.json();
      setError(d.error ?? "حدث خطأ");
      toast(d.error ?? "حدث خطأ", "error");
    }
    setPaying(false);
  };

  if (loading) return <LoadingSkeleton />;
  if (!invoice) return <div className="text-center py-20 text-[#64748b]">الفاتورة غير موجودة</div>;

  const canIssue = invoice.status === "DRAFT";
  const canPay = ["ISSUED", "PARTIAL"].includes(invoice.status);
  const canCancel = ["DRAFT", "ISSUED", "PARTIAL"].includes(invoice.status);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        subtitle={formatDateTime(invoice.createdAt)}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الفواتير", href: "/invoices" },
          { label: invoice.invoiceNumber },
        ]}
        action={
          <div className="flex gap-2 flex-wrap">
            <Link href={`/print/invoices/${id}`} target="_blank">
              <Button variant="outline" className="gap-2">
                <Printer className="h-4 w-4" />طباعة
              </Button>
            </Link>
            <a
              href={buildInvoiceWhatsAppUrl({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                customerName: invoice.customer.name,
                customerPhone: invoice.customer.phone,
                currency: invoice.currency,
                total: Number(invoice.total),
                remaining: Number(invoice.remainingAmount),
                origin: typeof window !== "undefined" ? window.location.origin : "",
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="gap-2 text-[#25d366] border-[#25d366]/40 hover:bg-[#25d366]/10 hover:text-[#1da851]">
                <MessageCircle className="h-4 w-4" />واتساب
              </Button>
            </a>
            {canIssue && (
              <Button onClick={() => changeStatus("ISSUED")} disabled={actionLoading}>
                {actionLoading ? "..." : "إصدار الفاتورة"}
              </Button>
            )}
            {canPay && (
              <Button onClick={() => setShowPayment(true)} className="gap-2">
                <CreditCard className="h-4 w-4" />تسجيل دفعة
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCancelConfirm(true)}>
                <X className="h-4 w-4" />إلغاء
              </Button>
            )}
          </div>
        }
      />

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Status banner */}
      <div className="flex items-center gap-3 bg-white border border-[#e2e8f0] rounded-xl px-4 py-3">
        {invoice.status === "PAID" ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : invoice.status === "CANCELLED" ? (
          <X className="h-5 w-5 text-red-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-blue-500" />
        )}
        <span className="text-sm font-medium text-[#1e293b]">
          الحالة: <StatusBadge status={{ type: "invoice", status: invoice.status }} />
        </span>
        <span className="text-sm text-[#64748b] mr-auto">
          العميل:{" "}
          <Link href={`/customers/${invoice.customer.id}`} className="text-[#104e98] hover:underline">
            {invoice.customer.name}
          </Link>
        </span>
      </div>

      {/* Items table */}
      <SectionCard title="الأصناف">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <tr>
                <th className="text-right px-3 py-2.5 font-medium text-[#64748b]">الصنف</th>
                <th className="text-center px-3 py-2.5 font-medium text-[#64748b]">الكمية</th>
                <th className="text-left px-3 py-2.5 font-medium text-[#64748b]">السعر</th>
                <th className="text-left px-3 py-2.5 font-medium text-[#64748b]">الخصم</th>
                <th className="text-left px-3 py-2.5 font-medium text-[#64748b]">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5 font-medium text-[#1e293b]">{item.name}</td>
                  <td className="px-3 py-2.5 text-center text-[#64748b]">{item.qty}</td>
                  <td className="px-3 py-2.5 ltr text-left">₪{Number(item.unitPrice).toFixed(2)}</td>
                  <td className="px-3 py-2.5 ltr text-left text-red-500">
                    {Number(item.discount) > 0 && `- ₪${Number(item.discount).toFixed(2)}`}
                  </td>
                  <td className="px-3 py-2.5 ltr text-left font-medium">₪{Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals summary */}
        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#64748b]">المجموع الفرعي</dt>
              <dd className="ltr">₪{Number(invoice.subtotal).toFixed(2)}</dd>
            </div>
            {Number(invoice.discountAmount) > 0 && (
              <div className="flex justify-between text-red-600">
                <dt>الخصم</dt>
                <dd className="ltr">- ₪{Number(invoice.discountAmount).toFixed(2)}</dd>
              </div>
            )}
            {Number(invoice.taxAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#64748b]">الضريبة ({Number(invoice.taxPercent)}%)</dt>
                <dd className="ltr">₪{Number(invoice.taxAmount).toFixed(2)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#e2e8f0] font-bold text-[#0b2345] text-base">
              <dt>الإجمالي</dt>
              <dd className="ltr">₪{Number(invoice.total).toFixed(2)}</dd>
            </div>
            {Number(invoice.paidAmount) > 0 && (
              <div className="flex justify-between text-green-600">
                <dt>مدفوع</dt>
                <dd className="ltr">₪{Number(invoice.paidAmount).toFixed(2)}</dd>
              </div>
            )}
            {Number(invoice.remainingAmount) > 0 && (
              <div className="flex justify-between text-orange-600 font-medium">
                <dt>المتبقي</dt>
                <dd className="ltr">₪{Number(invoice.remainingAmount).toFixed(2)}</dd>
              </div>
            )}
          </dl>
        </div>
      </SectionCard>

      {/* Payment history */}
      {invoice.debts.length > 0 && invoice.debts[0].payments.length > 0 && (
        <SectionCard title="سجل الدفعات">
          <ul className="divide-y divide-[#f1f5f9]">
            {invoice.debts[0].payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-[#1e293b] ltr">₪{Number(p.amount).toFixed(2)}</span>
                  {p.note && <span className="text-[#64748b] mr-2">{p.note}</span>}
                </div>
                <span className="text-[#94a3b8]">{formatDateTime(p.paidAt)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {invoice.notes && (
        <SectionCard title="ملاحظات">
          <p className="text-sm text-[#64748b] whitespace-pre-line">{invoice.notes}</p>
        </SectionCard>
      )}

      {/* Payment dialog */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#0b2345]">تسجيل دفعة</h3>
            <p className="text-sm text-[#64748b]">
              المتبقي: <span className="font-medium text-[#0b2345] ltr">₪{Number(invoice.remainingAmount).toFixed(2)}</span>
            </p>
            <div className="space-y-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                max={Number(invoice.remainingAmount)}
                placeholder="المبلغ"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                autoFocus
                dir="ltr"
              />
              <Input
                placeholder="ملاحظة (اختياري)"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowPayment(false); setError(""); }}>إلغاء</Button>
              <Button onClick={addPayment} disabled={paying}>
                {paying ? "جاري التسجيل..." : "تسجيل"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={cancelConfirm}
        onClose={() => setCancelConfirm(false)}
        onConfirm={() => changeStatus("CANCELLED")}
        title="إلغاء الفاتورة"
        description="هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم إعادة المخزون المخصوم."
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
