"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wallet, Clock, AlertCircle, CheckCircle2, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PageHeader, SearchInput, StatusBadge, Pagination,
  EmptyState, CardSkeleton, StatCard, FormField, ConfirmDialog, useToast,
} from "@/components/shared";
import { ITEMS_PER_PAGE, CURRENCY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { DebtStatus, Currency } from "@prisma/client";

interface PayableRow {
  id: string;
  amount: number;
  currency: Currency;
  reason: string | null;
  status: DebtStatus;
  dueDate: string | null;
  createdAt: string;
  supplier: { id: string; name: string; phone: string | null };
  payments: Array<{ id: string; amount: number; paidAt: string }>;
}

interface SupplierOption {
  id: string;
  name: string;
}

const STATUSES: Array<{ value: DebtStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "PENDING", label: "معلق" },
  { value: "PARTIAL", label: "جزئي" },
  { value: "PAID", label: "مسدد" },
];

export default function PayablesPage() {
  return (
    <Suspense>
      <PayablesPageContent />
    </Suspense>
  );
}

function PayablesPageContent() {
  const searchParams = useSearchParams();
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DebtStatus | "">((searchParams.get("status") ?? "") as DebtStatus | "");
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [payingPayable, setPayingPayable] = useState<PayableRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const { toast } = useToast();
  // Add/edit payable form. `formMode` null = closed; editingPayable set in edit mode.
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editingPayable, setEditingPayable] = useState<PayableRow | null>(null);
  const [fSupplierId, setFSupplierId] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fCurrency, setFCurrency] = useState<Currency>("ILS");
  const [fReason, setFReason] = useState("");
  const [fDueDate, setFDueDate] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState("");

  const [deletingPayable, setDeletingPayable] = useState<PayableRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ page: page.toString(), search, ...(status ? { status } : {}) });
    try {
      const res = await fetch(`/api/payables?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPayables(data.payables);
        setTotal(data.total);
        setTotalPages(data.pageCount);
        setOutstanding(data.totalOutstanding);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  useEffect(() => {
    fetch("/api/suppliers?all=true")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const openPayment = (p: PayableRow) => {
    const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
    const remaining = Number(p.amount) - paid;
    setPayAmount(remaining.toFixed(2));
    setPayNote("");
    setPayError("");
    setPayingPayable(p);
  };

  const submitPayment = async () => {
    if (!payingPayable) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setPayError("أدخل مبلغًا صحيحًا"); return; }
    setPaying(true);
    const res = await fetch(`/api/payables/${payingPayable.id}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, note: payNote || undefined }),
    });
    if (res.ok) { setPayingPayable(null); load(); }
    else { const d = await res.json(); setPayError(d.error ?? "حدث خطأ"); }
    setPaying(false);
  };

  const openAddPayable = () => {
    setEditingPayable(null);
    setFSupplierId("");
    setFAmount("");
    setFCurrency("ILS");
    setFReason("");
    setFDueDate("");
    setFNotes("");
    setFError("");
    setFormMode("add");
  };

  const openEditPayable = (p: PayableRow) => {
    setEditingPayable(p);
    setFSupplierId(p.supplier.id);
    setFAmount(Number(p.amount).toFixed(2));
    setFCurrency(p.currency);
    setFReason(p.reason ?? "");
    setFDueDate(p.dueDate ? p.dueDate.slice(0, 10) : "");
    setFNotes("");
    setFError("");
    setFormMode("edit");
  };

  const closeForm = () => { setFormMode(null); setEditingPayable(null); };

  const submitPayableForm = async () => {
    const amount = parseFloat(fAmount);
    if (formMode === "add" && !fSupplierId) { setFError("اختر المورد"); return; }
    if (!amount || amount <= 0) { setFError("أدخل مبلغًا صحيحًا"); return; }
    setFSaving(true);
    setFError("");
    try {
      let res: Response;
      if (formMode === "add") {
        res = await fetch("/api/payables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplierId: fSupplierId,
            amount,
            currency: fCurrency,
            reason: fReason || undefined,
            dueDate: fDueDate || undefined,
            notes: fNotes || undefined,
          }),
        });
      } else {
        res = await fetch(`/api/payables/${editingPayable!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: fReason,
            dueDate: fDueDate || null,
            ...(fNotes.trim() ? { notes: fNotes } : {}),
            amount,
            currency: fCurrency,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setFError(data.error ?? "حدث خطأ"); return; }
      toast(formMode === "add" ? "تمت إضافة المستحق" : "تم تعديل المستحق");
      closeForm();
      load();
    } catch {
      setFError("تعذّر الاتصال بالخادم");
    } finally {
      setFSaving(false);
    }
  };

  const deletePayable = async () => {
    if (!deletingPayable) return;
    setDeleting(true);
    const res = await fetch(`/api/payables/${deletingPayable.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("تم حذف المستحق");
      setDeletingPayable(null);
      load();
    } else {
      const d = await res.json();
      toast(d.error ?? "تعذّر حذف المستحق", "error");
    }
    setDeleting(false);
  };

  const isOverdue = (p: PayableRow) =>
    p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "PAID";

  const pendingCount = payables.filter((p) => p.status !== "PAID").length;
  const paidCount = payables.filter((p) => p.status === "PAID").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مستحقات الموردين"
        subtitle={`${total} سجل`}
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "مستحقات الموردين" }]}
        action={
          <Button className="gap-2" onClick={openAddPayable}>
            <Plus className="h-4 w-4" />مستحق جديد
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="إجمالي المستحقات المعلقة" value={`₪${outstanding.toFixed(2)}`} icon={AlertCircle} iconColor="text-red-500" iconBg="bg-red-50" />
        <StatCard label="مستحقات معلقة" value={pendingCount} icon={Clock} iconColor="text-orange-500" iconBg="bg-orange-50" />
        <StatCard label="مسددة (هذه الصفحة)" value={paidCount} icon={CheckCircle2} iconColor="text-green-500" iconBg="bg-green-50" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput onSearch={setSearch} placeholder="بحث باسم المورد..." className="w-64" />
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
      ) : loadError ? (
        <div className="bg-white rounded-xl border border-red-200 p-8 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <p className="text-sm text-[#64748b]">تعذّر تحميل المستحقات. قد تكون هناك مشكلة مؤقتة في الاتصال بالخادم.</p>
          <Button variant="outline" onClick={() => load()}>إعادة المحاولة</Button>
        </div>
      ) : payables.length === 0 ? (
        <EmptyState icon={Wallet} title="لا توجد مستحقات" description="لا توجد مستحقات مسجلة حاليًا" />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {payables.map((p) => {
              const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
              const remaining = Number(p.amount) - paid;
              return (
                <li key={p.id} className={`bg-white rounded-xl border p-4 ${isOverdue(p) ? "border-red-200 bg-red-50/40" : "border-[#e2e8f0]"}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link href={`/suppliers/${p.supplier.id}`} className="font-semibold text-[#104e98] hover:underline min-w-0 break-words">
                      {p.supplier.name}
                    </Link>
                    <StatusBadge status={{ type: "debt", status: p.status }} />
                  </div>
                  {p.reason && <p className="text-xs text-[#64748b] mb-2">{p.reason}</p>}
                  <dl className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <dt className="text-[#64748b]">المبلغ</dt>
                      <dd className="mt-0.5 font-medium ltr">₪{Number(p.amount).toFixed(2)}</dd>
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
                    {p.dueDate ? (
                      <span className={`flex items-center gap-1 text-xs ${isOverdue(p) ? "text-red-600 font-medium" : "text-[#64748b]"}`}>
                        {isOverdue(p) && <Clock className="h-3 w-3" />}
                        {formatDate(p.dueDate)}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEditPayable(p)}>
                        <Pencil className="h-3.5 w-3.5" />تعديل
                      </Button>
                      {p.status !== "PAID" && (
                        <Button size="sm" variant="outline" onClick={() => openPayment(p)}>
                          تسجيل دفعة
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setDeletingPayable(p)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المورد</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">السبب</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المسدد</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الاستحقاق</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {payables.map((p) => {
                  const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
                  const remaining = Number(p.amount) - paid;
                  return (
                    <tr key={p.id} className={`hover:bg-[#f8fafc] transition-colors ${isOverdue(p) ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <Link href={`/suppliers/${p.supplier.id}`} className="font-medium text-[#104e98] hover:underline">
                          {p.supplier.name}
                        </Link>
                        {p.supplier.phone && <p className="text-xs text-[#94a3b8] ltr">{p.supplier.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-[#64748b]">{p.reason ?? "—"}</td>
                      <td className="px-4 py-3 font-medium ltr">₪{Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {paid > 0 ? (
                          <div>
                            <span className="text-green-600 ltr">₪{paid.toFixed(2)}</span>
                            {remaining > 0 && <p className="text-xs text-orange-500 ltr">متبقي ₪{remaining.toFixed(2)}</p>}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {p.dueDate ? (
                          <span className={`flex items-center gap-1 text-sm ${isOverdue(p) ? "text-red-600 font-medium" : "text-[#64748b]"}`}>
                            {isOverdue(p) && <Clock className="h-3.5 w-3.5" />}
                            {formatDate(p.dueDate)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "debt", status: p.status }} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEditPayable(p)}>
                            <Pencil className="h-3.5 w-3.5" />تعديل
                          </Button>
                          {p.status !== "PAID" && (
                            <Button size="sm" variant="outline" onClick={() => openPayment(p)}>
                              تسجيل دفعة
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDeletingPayable(p)}
                            aria-label="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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

      {payingPayable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#0b2345]">تسجيل دفعة</h3>
            <p className="text-sm text-[#64748b]">
              المورد: <span className="font-medium text-[#0b2345]">{payingPayable.supplier.name}</span>
            </p>
            <p className="text-sm text-[#64748b]">
              إجمالي المستحق: <span className="font-medium ltr">₪{Number(payingPayable.amount).toFixed(2)}</span>
            </p>
            <div className="space-y-3">
              <Input type="number" min="0.01" step="0.01" placeholder="المبلغ" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus dir="ltr" />
              <Input placeholder="ملاحظة (اختياري)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
            {payError && <p className="text-xs text-red-600">{payError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPayingPayable(null)}>إلغاء</Button>
              <Button onClick={submitPayment} disabled={paying}>{paying ? "جاري التسجيل..." : "تسجيل"}</Button>
            </div>
          </div>
        </div>
      )}

      {formMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#0b2345]">
              {formMode === "add" ? "مستحق جديد" : "تعديل المستحق"}
            </h3>

            {formMode === "add" ? (
              <FormField label="المورد" required>
                <select
                  value={fSupplierId}
                  onChange={(e) => setFSupplierId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                >
                  <option value="">اختر موردًا...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </FormField>
            ) : (
              <p className="text-sm text-[#64748b]">
                المورد: <span className="font-medium text-[#0b2345]">{editingPayable?.supplier.name}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="المبلغ" required>
                <Input
                  type="number" min="0.01" step="0.01" dir="ltr"
                  value={fAmount}
                  onChange={(e) => setFAmount(e.target.value)}
                />
              </FormField>
              <FormField label="العملة">
                <select
                  value={fCurrency}
                  onChange={(e) => setFCurrency(e.target.value as Currency)}
                  className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                >
                  {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
                    <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="السبب (اختياري)">
              <Input value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder="مثال: شراء بضاعة..." />
            </FormField>
            <FormField label="تاريخ الاستحقاق (اختياري)">
              <Input type="date" dir="ltr" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} />
            </FormField>
            <FormField label="ملاحظات (اختياري)">
              <Textarea rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
            </FormField>

            {fError && <p className="text-xs text-red-600">{fError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeForm} disabled={fSaving}>إلغاء</Button>
              <Button onClick={submitPayableForm} disabled={fSaving}>
                {fSaving ? "جاري الحفظ..." : formMode === "add" ? "إضافة" : "حفظ"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingPayable}
        onClose={() => setDeletingPayable(null)}
        onConfirm={deletePayable}
        title="حذف المستحق"
        description={
          deletingPayable && deletingPayable.payments.length > 0
            ? "سيتم حذف هذا المستحق نهائيًا. الدفعات المسجّلة ستبقى كسجل تاريخي. لا يمكن التراجع."
            : "سيتم حذف هذا المستحق نهائيًا. لا يمكن التراجع."
        }
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
