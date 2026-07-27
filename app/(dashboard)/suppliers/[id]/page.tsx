"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader, CurrencyDisplay, SectionCard, FormField, StatusBadge, ConfirmDialog,
} from "@/components/shared";
import { formatDate } from "@/lib/formatters";
import type { Product, Payable, PayablePayment } from "@prisma/client";

interface SupplierDetail {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  createdAt: string;
  products: Product[];
  payables: (Payable & { payments: PayablePayment[] })[];
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", company: "", notes: "" });

  const [payingPayable, setPayingPayable] = useState<(Payable & { payments: PayablePayment[] }) | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const loadSupplier = () => {
    fetch(`/api/suppliers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setSupplier(d);
        setForm({ name: d.name, phone: d.phone ?? "", company: d.company ?? "", notes: d.notes ?? "" });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(loadSupplier, [id]);

  const openPayment = (p: Payable & { payments: PayablePayment[] }) => {
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
    if (res.ok) { setPayingPayable(null); loadSupplier(); }
    else { const d = await res.json(); setPayError(d.error ?? "حدث خطأ"); }
    setPaying(false);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    const res = await fetch(`/api/suppliers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        company: form.company || null,
        notes: form.notes || null,
      }),
    });
    const data = await res.json();
    if (res.ok) { setSupplier((s) => s ? { ...s, ...data } : s); setEditing(false); }
    setSaveLoading(false);
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    setDeleteLoading(false);
    router.push("/suppliers");
  };

  if (loading) return <div className="h-48 bg-white rounded-xl animate-pulse" />;
  if (!supplier) return <div className="text-center py-16 text-[#64748b]">المورد غير موجود</div>;

  const totalPayables = supplier.payables.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = supplier.payables.reduce(
    (sum, p) => sum + p.payments.reduce((s, pay) => s + Number(pay.amount), 0), 0
  );

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={supplier.company ?? ""}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الموردون", href: "/suppliers" },
          { label: supplier.name },
        ]}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEditing(!editing)}>
              <Edit className="h-4 w-4" />
              {editing ? "إلغاء التعديل" : "تعديل"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          </div>
        }
      />

      {editing ? (
        <SectionCard title="تعديل بيانات المورد" className="max-w-xl">
          <div className="space-y-4">
            <FormField label="الاسم" htmlFor="name" required>
              <Input id="name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="الشركة">
              <Input value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} />
            </FormField>
            <FormField label="الهاتف">
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
            </FormField>
            <FormField label="ملاحظات">
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saveLoading}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saveLoading}>{saveLoading ? "جاري الحفظ..." : "حفظ"}</Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "إجمالي المستحقات", value: <CurrencyDisplay amount={totalPayables} />, color: "text-red-600" },
            { label: "المدفوع", value: <CurrencyDisplay amount={totalPaid} />, color: "text-green-600" },
            { label: "المتبقي", value: <CurrencyDisplay amount={totalPayables - totalPaid} />, color: "text-orange-600" },
            { label: "عدد المنتجات", value: <span className="text-2xl font-bold text-[#0b2345]">{supplier.products.length}</span> },
          ].map((stat) => (
            <SectionCard key={stat.label}>
              <p className="text-sm text-[#64748b] mb-1">{stat.label}</p>
              <div className={stat.color}>{stat.value}</div>
            </SectionCard>
          ))}
        </div>
      )}

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products">المنتجات ({supplier.products.length})</TabsTrigger>
          <TabsTrigger value="payables">المستحقات ({supplier.payables.length})</TabsTrigger>
          <TabsTrigger value="info">معلومات الاتصال</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <SectionCard noPadding>
            {supplier.products.length === 0 ? (
              <p className="text-center py-8 text-[#64748b] text-sm">لا توجد منتجات لهذا المورد</p>
            ) : (
              <>
              {/* Mobile: cards */}
              <ul className="md:hidden divide-y divide-[#f1f5f9]">
                {supplier.products.map((p) => (
                  <li key={p.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Link href={`/inventory/${p.id}`} className="font-medium text-[#1e293b] hover:text-[#104e98] min-w-0 break-words">{p.name}</Link>
                      <StatusBadge status={{ type: "custom", label: p.isActive ? "نشط" : "غير نشط", color: p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600" }} />
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-[#64748b]">التكلفة</dt>
                        <dd className="mt-0.5"><CurrencyDisplay amount={Number(p.costPrice)} size="sm" /></dd>
                      </div>
                      <div>
                        <dt className="text-[#64748b]">البيع</dt>
                        <dd className="mt-0.5"><CurrencyDisplay amount={Number(p.sellPrice)} size="sm" /></dd>
                      </div>
                      <div>
                        <dt className="text-[#64748b]">المخزون</dt>
                        <dd className="mt-0.5 font-medium">{p.stockQty}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["المنتج", "سعر التكلفة", "سعر البيع", "المخزون", "الحالة"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplier.products.map((p) => (
                    <tr key={p.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                      <td className="px-4 py-3">
                        <Link href={`/inventory/${p.id}`} className="font-medium hover:text-[#104e98]">{p.name}</Link>
                      </td>
                      <td className="px-4 py-3"><CurrencyDisplay amount={Number(p.costPrice)} size="sm" /></td>
                      <td className="px-4 py-3"><CurrencyDisplay amount={Number(p.sellPrice)} size="sm" /></td>
                      <td className="px-4 py-3 font-medium">{p.stockQty}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "custom", label: p.isActive ? "نشط" : "غير نشط", color: p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payables">
          <SectionCard noPadding>
            {supplier.payables.length === 0 ? (
              <p className="text-center py-8 text-[#64748b] text-sm">لا توجد مستحقات</p>
            ) : (
              <>
              {/* Mobile: cards */}
              <ul className="md:hidden divide-y divide-[#f1f5f9]">
                {supplier.payables.map((p) => {
                  const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
                  const remaining = Number(p.amount) - paid;
                  return (
                    <li key={p.id} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-medium text-[#1e293b] min-w-0 break-words">{p.reason ?? "—"}</p>
                        <StatusBadge status={{ type: "debt", status: p.status }} />
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-xs mb-2">
                        <div>
                          <dt className="text-[#64748b]">المبلغ</dt>
                          <dd className="mt-0.5"><CurrencyDisplay amount={Number(p.amount)} size="sm" /></dd>
                        </div>
                        <div>
                          <dt className="text-[#64748b]">المدفوع</dt>
                          <dd className="mt-0.5"><CurrencyDisplay amount={paid} size="sm" className="text-green-600" /></dd>
                        </div>
                        <div>
                          <dt className="text-[#64748b]">المتبقي</dt>
                          <dd className="mt-0.5"><CurrencyDisplay amount={remaining} size="sm" className="text-red-600" /></dd>
                        </div>
                      </dl>
                      {p.dueDate && <p className="text-xs text-[#94a3b8] mb-2">استحقاق: {formatDate(p.dueDate)}</p>}
                      {p.status !== "PAID" && (
                        <Button size="sm" variant="outline" onClick={() => openPayment(p)}>تسجيل دفعة</Button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["السبب", "المبلغ", "المدفوع", "المتبقي", "الحالة", "تاريخ الاستحقاق", ""].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplier.payables.map((p) => {
                    const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
                    const remaining = Number(p.amount) - paid;
                    return (
                      <tr key={p.id} className="border-b border-[#f8fafc]">
                        <td className="px-4 py-3 text-[#1e293b]">{p.reason ?? "—"}</td>
                        <td className="px-4 py-3"><CurrencyDisplay amount={Number(p.amount)} size="sm" /></td>
                        <td className="px-4 py-3"><CurrencyDisplay amount={paid} size="sm" className="text-green-600" /></td>
                        <td className="px-4 py-3"><CurrencyDisplay amount={remaining} size="sm" className="text-red-600" /></td>
                        <td className="px-4 py-3"><StatusBadge status={{ type: "debt", status: p.status }} /></td>
                        <td className="px-4 py-3 text-[#94a3b8] text-xs">{p.dueDate ? formatDate(p.dueDate) : "—"}</td>
                        <td className="px-4 py-3">
                          {p.status !== "PAID" && (
                            <Button size="sm" variant="outline" onClick={() => openPayment(p)}>تسجيل دفعة</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="info">
          <SectionCard className="max-w-md">
            <div className="space-y-3 text-sm">
              {[
                ["الاسم", supplier.name],
                ["الشركة", supplier.company ?? "—"],
                ["الهاتف", supplier.phone ?? "—"],
                ["تاريخ الإضافة", formatDate(supplier.createdAt)],
                ["ملاحظات", supplier.notes ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-4">
                  <span className="text-[#94a3b8] w-28 flex-shrink-0">{label}</span>
                  <span className="font-medium text-[#1e293b]">{value}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {payingPayable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#0b2345]">تسجيل دفعة</h3>
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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف المورد"
        description={`هل أنت متأكد من حذف "${supplier.name}"؟`}
        confirmLabel="حذف"
        loading={deleteLoading}
      />
    </div>
  );
}
