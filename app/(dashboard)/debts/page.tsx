"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CreditCard, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader, SearchInput, StatusBadge, Pagination,
  EmptyState, CardSkeleton, StatCard,
} from "@/components/shared";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { DebtStatus, Currency } from "@prisma/client";

interface DebtRow {
  id: string;
  amount: number;
  currency: Currency;
  reason: string | null;
  status: DebtStatus;
  dueDate: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null };
  invoice: { id: string; invoiceNumber: string } | null;
  payments: Array<{ id: string; amount: number; paidAt: string }>;
}

const STATUSES: Array<{ value: DebtStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "PENDING", label: "معلق" },
  { value: "PARTIAL", label: "جزئي" },
  { value: "PAID", label: "مسدد" },
];

export default function DebtsPage() {
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DebtStatus | "">("");
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  const [payingDebt, setPayingDebt] = useState<DebtRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), search, ...(status ? { status } : {}) });
    const res = await fetch(`/api/debts?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDebts(data.debts);
      setTotal(data.total);
      setTotalPages(data.pageCount);
      setOutstanding(data.totalOutstanding);
    }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  const openPayment = (debt: DebtRow) => {
    const paid = debt.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(debt.amount) - paid;
    setPayAmount(remaining.toFixed(2));
    setPayNote("");
    setPayError("");
    setPayingDebt(debt);
  };

  const submitPayment = async () => {
    if (!payingDebt) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setPayError("أدخل مبلغًا صحيحًا"); return; }
    setPaying(true);
    const res = await fetch(`/api/debts/${payingDebt.id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: payNote || undefined }),
    });
    if (res.ok) { setPayingDebt(null); load(); }
    else { const d = await res.json(); setPayError(d.error ?? "حدث خطأ"); }
    setPaying(false);
  };

  const isOverdue = (d: DebtRow) =>
    d.dueDate && new Date(d.dueDate) < new Date() && d.status !== "PAID";

  const pendingCount = debts.filter((d) => d.status !== "PAID").length;
  const paidCount = debts.filter((d) => d.status === "PAID").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ديون العملاء"
        subtitle={`${total} سجل`}
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الديون" }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="إجمالي الديون المعلقة" value={`₪${outstanding.toFixed(2)}`} icon={AlertCircle} iconColor="text-red-500" iconBg="bg-red-50" />
        <StatCard label="ديون معلقة" value={pendingCount} icon={Clock} iconColor="text-orange-500" iconBg="bg-orange-50" />
        <StatCard label="مسددة (هذه الصفحة)" value={paidCount} icon={CheckCircle2} iconColor="text-green-500" iconBg="bg-green-50" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput onSearch={setSearch} placeholder="بحث باسم العميل..." className="w-64" />
        <div className="flex gap-1 bg-[#f1f5f9] rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                status === s.value ? "bg-white text-[#104e98] shadow-sm" : "text-[#64748b] hover:text-[#1e293b]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : debts.length === 0 ? (
        <EmptyState icon={CreditCard} title="لا توجد ديون" description="لا توجد ديون مسجلة حاليًا" />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {debts.map((d) => {
              const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
              const remaining = Number(d.amount) - paid;
              return (
                <li key={d.id} className={`bg-white rounded-xl border p-4 ${isOverdue(d) ? "border-red-200 bg-red-50/40" : "border-[#e2e8f0]"}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link href={`/customers/${d.customer.id}`} className="font-semibold text-[#104e98] hover:underline min-w-0 break-words">
                      {d.customer.name}
                    </Link>
                    <StatusBadge status={{ type: "debt", status: d.status }} />
                  </div>
                  {d.invoice ? (
                    <Link href={`/invoices/${d.invoice.id}`} className="block text-xs text-[#104e98] hover:underline ltr mb-2">
                      {d.invoice.invoiceNumber}
                    </Link>
                  ) : d.reason ? (
                    <p className="text-xs text-[#64748b] mb-2">{d.reason}</p>
                  ) : null}
                  <dl className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <dt className="text-[#64748b]">المبلغ</dt>
                      <dd className="mt-0.5 font-medium ltr">₪{Number(d.amount).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">المسدد</dt>
                      <dd className="mt-0.5 text-green-600 ltr">{paid > 0 ? `₪${paid.toFixed(2)}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[#64748b]">المتبقي</dt>
                      <dd className="mt-0.5 text-orange-600 ltr">{remaining > 0 ? `₪${remaining.toFixed(2)}` : "—"}</dd>
                    </div>
                  </dl>
                  <div className="flex items-center justify-between gap-2">
                    {d.dueDate ? (
                      <span className={`flex items-center gap-1 text-xs ${isOverdue(d) ? "text-red-600 font-medium" : "text-[#64748b]"}`}>
                        {isOverdue(d) && <Clock className="h-3 w-3" />}
                        {formatDate(d.dueDate)}
                      </span>
                    ) : <span />}
                    {d.status !== "PAID" && (
                      <Button size="sm" variant="outline" onClick={() => openPayment(d)}>
                        تسجيل دفعة
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">العميل</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">السبب / الفاتورة</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المسدد</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الاستحقاق</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {debts.map((d) => {
                  const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
                  const remaining = Number(d.amount) - paid;
                  return (
                    <tr key={d.id} className={`hover:bg-[#f8fafc] transition-colors ${isOverdue(d) ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <Link href={`/customers/${d.customer.id}`} className="font-medium text-[#104e98] hover:underline">
                          {d.customer.name}
                        </Link>
                        {d.customer.phone && <p className="text-xs text-[#94a3b8] ltr">{d.customer.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">
                        {d.invoice ? (
                          <Link href={`/invoices/${d.invoice.id}`} className="text-[#104e98] hover:underline ltr text-xs">
                            {d.invoice.invoiceNumber}
                          </Link>
                        ) : (d.reason ?? "—")}
                      </td>
                      <td className="px-4 py-3 font-medium ltr">₪{Number(d.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {paid > 0 ? (
                          <div>
                            <span className="text-green-600 ltr">₪{paid.toFixed(2)}</span>
                            {remaining > 0 && <p className="text-xs text-orange-500 ltr">متبقي ₪{remaining.toFixed(2)}</p>}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {d.dueDate ? (
                          <span className={`flex items-center gap-1 text-sm ${isOverdue(d) ? "text-red-600 font-medium" : "text-[#64748b]"}`}>
                            {isOverdue(d) && <Clock className="h-3.5 w-3.5" />}
                            {formatDate(d.dueDate)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "debt", status: d.status }} />
                      </td>
                      <td className="px-4 py-3">
                        {d.status !== "PAID" && (
                          <Button size="sm" variant="outline" onClick={() => openPayment(d)}>
                            تسجيل دفعة
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={ITEMS_PER_PAGE} onPageChange={setPage} />
      )}

      {payingDebt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#0b2345]">تسجيل دفعة</h3>
            <p className="text-sm text-[#64748b]">
              العميل: <span className="font-medium text-[#0b2345]">{payingDebt.customer.name}</span>
            </p>
            <p className="text-sm text-[#64748b]">
              إجمالي الدين: <span className="font-medium ltr">₪{Number(payingDebt.amount).toFixed(2)}</span>
            </p>
            <div className="space-y-3">
              <Input type="number" min="0.01" step="0.01" placeholder="المبلغ" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus dir="ltr" />
              <Input placeholder="ملاحظة (اختياري)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
            {payError && <p className="text-xs text-red-600">{payError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPayingDebt(null)}>إلغاء</Button>
              <Button onClick={submitPayment} disabled={paying}>{paying ? "جاري التسجيل..." : "تسجيل"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
