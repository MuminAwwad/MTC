"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Wallet, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader, SearchInput, Pagination, EmptyState, CardSkeleton, StatCard, FormField, SectionCard,
} from "@/components/shared";
import { ITEMS_PER_PAGE, CURRENCY_LABELS } from "@/lib/constants";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/shared";
import type { Currency } from "@prisma/client";

interface Category { id: string; name: string; icon: string | null; color: string | null }
interface ExpenseRow {
  id: string;
  amount: number;
  currency: Currency;
  description: string | null;
  date: string;
  category: Category | null;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAmount, setTotalAmount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  // Add expense form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ categoryId: "", amount: "", currency: "ILS" as Currency, description: "", date: new Date().toISOString().split("T")[0] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // New category inline
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState("");

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/expense-categories");
    if (res.ok) setCategories(await res.json());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      ...(filterCategory ? { categoryId: filterCategory } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    const res = await fetch(`/api/expenses?${params}`);
    if (res.ok) {
      const data = await res.json();
      setExpenses(data.expenses);
      setTotal(data.total);
      setTotalPages(data.pageCount);
      setTotalAmount(data.totalAmount);
    }
    setLoading(false);
  }, [page, search, filterCategory, dateFrom, dateTo]);

  useEffect(() => { load(); loadCategories(); }, [load, loadCategories]);
  useEffect(() => { setPage(1); }, [search, filterCategory, dateFrom, dateTo]);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    const res = await fetch("/api/expense-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName }),
    });
    if (res.ok) { const cat = await res.json(); setCategories((c) => [...c, cat]); setNewCatName(""); }
    setAddingCat(false);
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { setFormError("أدخل مبلغًا صحيحًا"); return; }
    setSaving(true);
    setFormError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: form.categoryId || undefined,
        amount: parseFloat(form.amount),
        currency: form.currency,
        description: form.description || undefined,
        date: form.date,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ categoryId: "", amount: "", currency: "ILS", description: "", date: new Date().toISOString().split("T")[0] });
      load();
    } else {
      const d = await res.json();
      setFormError(d.error ?? "حدث خطأ");
    }
    setSaving(false);
  };

  const deleteExpense = async () => {
    await fetch("/api/expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteId }),
    });
    setDeleteId("");
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="المصاريف"
        subtitle={`${total} سجل`}
        action={
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />مصروف جديد
          </Button>
        }
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "المصاريف" }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="إجمالي المصاريف" value={`₪${totalAmount.toFixed(2)}`} icon={Wallet} />
        <StatCard label="عدد السجلات" value={total} icon={Tag} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput onSearch={setSearch} placeholder="بحث بالوصف..." className="w-56" />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
        >
          <option value="">كل الفئات</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 text-sm w-36" dir="ltr" />
          <span className="text-[#94a3b8] text-sm">إلى</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 text-sm w-36" dir="ltr" />
        </div>
      </div>

      {/* Add expense form */}
      {showForm && (
        <SectionCard title="إضافة مصروف">
          <form onSubmit={submitExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="الفئة">
                <div className="flex gap-2">
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                    className="flex-1 h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                  >
                    <option value="">بدون فئة</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </FormField>
              <FormField label="المبلغ" required>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" dir="ltr" />
              </FormField>
              <FormField label="العملة">
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Currency }))}
                  className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                >
                  {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
                    <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="الوصف">
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="وصف المصروف..." />
              </FormField>
              <FormField label="التاريخ">
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} dir="ltr" />
              </FormField>
            </div>

            {/* Quick add category */}
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="فئة جديدة..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="max-w-48 text-sm h-8"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
              />
              <Button type="button" size="sm" variant="outline" onClick={addCategory} disabled={addingCat || !newCatName.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-[#94a3b8]">إضافة فئة</span>
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button type="submit" disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ المصروف"}</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <CardSkeleton />
      ) : expenses.length === 0 ? (
        <EmptyState icon={Wallet} title="لا توجد مصاريف" description="أضف أول مصروف للبدء" action={{ label: "مصروف جديد", onClick: () => setShowForm(true) }} />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {expenses.map((exp) => (
              <li key={exp.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    {exp.category && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#64748b] mb-1">
                        {exp.category.icon && <span>{exp.category.icon}</span>}
                        {exp.category.name}
                      </span>
                    )}
                    <p className="text-sm text-[#1e293b] break-words">{exp.description ?? "—"}</p>
                    <p className="text-xs text-[#94a3b8] mt-1">{formatDate(exp.date)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="font-bold text-[#0b2345] ltr">
                      {exp.currency === "ILS" ? "₪" : exp.currency === "USD" ? "$" : "JD"}
                      {Number(exp.amount).toFixed(2)}
                    </span>
                    <button onClick={() => setDeleteId(exp.id)} className="text-[#94a3b8] hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
            <li className="bg-[#f8fafc] rounded-xl border border-[#e2e8f0] p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-[#64748b]">الإجمالي (كل السجلات)</span>
              <span className="font-bold text-[#0b2345] ltr">₪{totalAmount.toFixed(2)}</span>
            </li>
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الفئة</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الوصف</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">المبلغ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3 text-[#64748b]">{formatDate(exp.date)}</td>
                    <td className="px-4 py-3">
                      {exp.category ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f1f5f9] text-[#64748b]">
                          {exp.category.icon && <span>{exp.category.icon}</span>}
                          {exp.category.name}
                        </span>
                      ) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#1e293b]">{exp.description ?? "—"}</td>
                    <td className="px-4 py-3 font-medium ltr">
                      {exp.currency === "ILS" ? "₪" : exp.currency === "USD" ? "$" : "JD"}
                      {Number(exp.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteId(exp.id)} className="text-[#94a3b8] hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#f8fafc] border-t-2 border-[#e2e8f0]">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-[#64748b]">الإجمالي (كل السجلات)</td>
                  <td className="px-4 py-3 font-bold text-[#0b2345] ltr">₪{totalAmount.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={ITEMS_PER_PAGE} onPageChange={setPage} />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId("")}
        onConfirm={deleteExpense}
        title="حذف المصروف"
        description="هل أنت متأكد من حذف هذا المصروف؟"
        variant="danger"
      />
    </div>
  );
}
