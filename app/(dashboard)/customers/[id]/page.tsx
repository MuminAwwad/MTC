"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit, Phone, MapPin, FileText, Wrench, CreditCard,
  CheckCircle2, Clock, TrendingUp, Save, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader, StatCard, CurrencyDisplay, StatusBadge,
  SectionCard, FormField, ConfirmDialog, EmptyState,
} from "@/components/shared";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { DEVICE_TYPE_LABELS } from "@/lib/constants";
import type { InvoiceStatus, TicketStatus, TicketPriority, DebtStatus, DeviceType } from "@prisma/client";

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  total: string | number;
  paidAmount: string | number;
  remainingAmount: string | number;
  status: InvoiceStatus;
  currency: string;
  createdAt: string;
}

interface CustomerTicket {
  id: string;
  ticketNumber: string;
  deviceType: DeviceType;
  deviceBrand: string | null;
  deviceModel: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  finalCost: string | number | null;
  estimatedCost: string | number | null;
  receivedAt: string;
  deliveredAt: string | null;
}

interface CustomerDebt {
  id: string;
  amount: string | number;
  currency: string;
  reason: string | null;
  status: DebtStatus;
  dueDate: string | null;
  createdAt: string;
  invoice: { invoiceNumber: string } | null;
  payments: { id: string; amount: string | number; paidAt: string }[];
}

interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  invoices: CustomerInvoice[];
  tickets: CustomerTicket[];
  debts: CustomerDebt[];
  stats: {
    totalSpent: number;
    invoiceCount: number;
    ticketCount: number;
    openDebt: number;
  };
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setCustomer(d);
        setForm({
          name: d.name,
          phone: d.phone ?? "",
          address: d.address ?? "",
          notes: d.notes ?? "",
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaveLoading(true);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCustomer((c) => c ? { ...c, ...data } : c);
      setEditing(false);
    }
    setSaveLoading(false);
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    router.push("/customers");
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 bg-[#e2e8f0] rounded" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-[#e2e8f0]" />)}
        </div>
        <div className="h-64 bg-white rounded-xl border border-[#e2e8f0]" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-[#64748b] mb-4">العميل غير موجود</p>
        <Button asChild variant="outline">
          <Link href="/customers">العودة للعملاء</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        title={customer.name}
        subtitle={customer.phone ?? customer.address ?? ""}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "العملاء", href: "/customers" },
          { label: customer.name },
        ]}
        action={
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saveLoading}>
                  <X className="h-4 w-4" /> إلغاء
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveLoading}>
                  <Save className="h-4 w-4" />
                  {saveLoading ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4" /> تعديل
                </Button>
                <Button asChild size="sm">
                  <Link href={`/invoices/new?customerId=${id}`}>
                    <FileText className="h-4 w-4" /> فاتورة جديدة
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Edit form */}
      {editing && (
        <SectionCard title="تعديل بيانات العميل" className="max-w-xl mb-6">
          <div className="space-y-4">
            <FormField label="الاسم" htmlFor="edit-name" required>
              <Input id="edit-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="الهاتف" htmlFor="edit-phone">
                <Input id="edit-phone" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
              </FormField>
              <FormField label="العنوان" htmlFor="edit-address">
                <Input id="edit-address" value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} />
              </FormField>
            </div>
            <FormField label="ملاحظات">
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </FormField>
          </div>
        </SectionCard>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={TrendingUp}
          label="إجمالي الإنفاق"
          value={formatCurrency(customer.stats.totalSpent)}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
        <StatCard
          icon={FileText}
          label="الفواتير"
          value={customer.stats.invoiceCount}
          iconColor="text-[#104e98]"
          iconBg="bg-[#e8f0fc]"
        />
        <StatCard
          icon={Wrench}
          label="تذاكر الصيانة"
          value={customer.stats.ticketCount}
          iconColor="text-orange-600"
          iconBg="bg-orange-100"
        />
        <StatCard
          icon={CreditCard}
          label="دين متبقي"
          value={formatCurrency(customer.stats.openDebt)}
          iconColor={customer.stats.openDebt > 0 ? "text-red-600" : "text-green-600"}
          iconBg={customer.stats.openDebt > 0 ? "bg-red-100" : "bg-green-100"}
        />
      </div>

      {/* Contact info strip */}
      {!editing && (customer.phone || customer.address) && (
        <div className="flex flex-wrap gap-4 mb-6 text-sm text-[#64748b]">
          {customer.phone && (
            <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:text-[#104e98]">
              <Phone className="h-4 w-4" />
              <span className="ltr">{customer.phone}</span>
            </a>
          )}
          {customer.address && (
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {customer.address}
            </span>
          )}
          {customer.notes && (
            <span className="text-[#94a3b8]">{customer.notes}</span>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices">
            الفواتير ({customer.invoices.length})
          </TabsTrigger>
          <TabsTrigger value="tickets">
            الصيانة ({customer.tickets.length})
          </TabsTrigger>
          <TabsTrigger value="debts">
            الديون ({customer.debts.length})
          </TabsTrigger>
        </TabsList>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <SectionCard
            noPadding
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={`/invoices/new?customerId=${id}`}>
                  <FileText className="h-3.5 w-3.5" /> فاتورة جديدة
                </Link>
              </Button>
            }
          >
            {customer.invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="لا توجد فواتير"
                description="لم يتم إنشاء أي فاتورة لهذا العميل بعد"
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["رقم الفاتورة", "الإجمالي", "المدفوع", "المتبقي", "الحالة", "التاريخ"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customer.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-[#104e98] hover:underline ltr">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <CurrencyDisplay amount={Number(inv.total)} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <CurrencyDisplay amount={Number(inv.paidAmount)} size="sm" className="text-green-600" />
                      </td>
                      <td className="px-4 py-3">
                        <CurrencyDisplay
                          amount={Number(inv.remainingAmount)}
                          size="sm"
                          className={Number(inv.remainingAmount) > 0 ? "text-red-600" : "text-[#94a3b8]"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "invoice", status: inv.status }} />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#94a3b8]">{formatDate(inv.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets">
          <SectionCard
            noPadding
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={`/maintenance/new?customerId=${id}`}>
                  <Wrench className="h-3.5 w-3.5" /> تذكرة جديدة
                </Link>
              </Button>
            }
          >
            {customer.tickets.length === 0 ? (
              <EmptyState
                icon={Wrench}
                title="لا توجد تذاكر صيانة"
                description="لم يتم فتح أي تذكرة صيانة لهذا العميل"
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["رقم التذكرة", "الجهاز", "الأولوية", "الحالة", "التكلفة", "تاريخ الاستلام"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customer.tickets.map((t) => (
                    <tr key={t.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                      <td className="px-4 py-3">
                        <Link href={`/maintenance/${t.id}`} className="font-medium text-[#104e98] hover:underline ltr">
                          {t.ticketNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1e293b]">{DEVICE_TYPE_LABELS[t.deviceType]}</p>
                        {(t.deviceBrand || t.deviceModel) && (
                          <p className="text-xs text-[#94a3b8]">
                            {[t.deviceBrand, t.deviceModel].filter(Boolean).join(" ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "priority", status: t.priority }} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={{ type: "ticket", status: t.status }} />
                      </td>
                      <td className="px-4 py-3">
                        {t.finalCost ? (
                          <CurrencyDisplay amount={Number(t.finalCost)} size="sm" />
                        ) : t.estimatedCost ? (
                          <span className="text-[#94a3b8] text-xs">
                            تقديري: <CurrencyDisplay amount={Number(t.estimatedCost)} size="sm" />
                          </span>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#94a3b8]">{formatDate(t.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>

        {/* Debts Tab */}
        <TabsContent value="debts">
          <SectionCard noPadding>
            {customer.debts.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="لا توجد ديون"
                description="هذا العميل ليس عليه أي ديون مستحقة"
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {["السبب", "المبلغ الأصلي", "المدفوع", "المتبقي", "الحالة", "تاريخ الاستحقاق"].map((h) => (
                      <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-[#64748b]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customer.debts.map((d) => {
                    const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
                    const remaining = Number(d.amount) - paid;
                    const isOverdue =
                      d.dueDate && new Date(d.dueDate) < new Date() && d.status !== "PAID";
                    return (
                      <tr key={d.id} className="border-b border-[#f8fafc] hover:bg-[#fafbfc]">
                        <td className="px-4 py-3">
                          <Link href={`/debts/${d.id}`} className="hover:text-[#104e98]">
                            <p className="font-medium text-[#1e293b]">
                              {d.reason ?? (d.invoice ? `فاتورة ${d.invoice.invoiceNumber}` : "دين")}
                            </p>
                            {d.invoice && (
                              <p className="text-xs text-[#94a3b8] ltr">{d.invoice.invoiceNumber}</p>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <CurrencyDisplay amount={Number(d.amount)} size="sm" />
                        </td>
                        <td className="px-4 py-3">
                          <CurrencyDisplay amount={paid} size="sm" className="text-green-600" />
                        </td>
                        <td className="px-4 py-3">
                          <CurrencyDisplay
                            amount={remaining}
                            size="sm"
                            className={remaining > 0 ? "text-red-600 font-semibold" : "text-[#94a3b8]"}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={{ type: "debt", status: d.status }} />
                        </td>
                        <td className="px-4 py-3">
                          {d.dueDate ? (
                            <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-[#94a3b8]"}`}>
                              {isOverdue && <Clock className="inline h-3 w-3 ml-1" />}
                              {formatDate(d.dueDate)}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* Danger zone */}
      <div className="mt-8 pt-6 border-t border-[#f1f5f9]">
        <button
          onClick={() => setDeleteOpen(true)}
          className="text-xs text-[#94a3b8] hover:text-red-500 transition-colors"
        >
          حذف هذا العميل
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف العميل"
        description={`هل أنت متأكد من حذف "${customer.name}"؟ لن تُحذف فواتيره أو تذاكر صيانته.`}
        confirmLabel="حذف العميل"
        loading={deleteLoading}
      />
    </div>
  );
}
