"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader, CurrencyDisplay, SectionCard, FormField, StatusBadge,
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
  const [form, setForm] = useState({ name: "", phone: "", company: "", notes: "" });

  useEffect(() => {
    fetch(`/api/suppliers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setSupplier(d);
        setForm({ name: d.name, phone: d.phone ?? "", company: d.company ?? "", notes: d.notes ?? "" });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

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
          <Button size="sm" onClick={() => setEditing(!editing)}>
            <Edit className="h-4 w-4" />
            {editing ? "إلغاء التعديل" : "تعديل"}
          </Button>
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
              <table className="w-full text-sm">
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
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="payables">
          <SectionCard noPadding>
            {supplier.payables.length === 0 ? (
              <p className="text-center py-8 text-[#64748b] text-sm">لا توجد مستحقات</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["السبب", "المبلغ", "المدفوع", "المتبقي", "الحالة", "تاريخ الاستحقاق"].map((h) => (
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
    </div>
  );
}
