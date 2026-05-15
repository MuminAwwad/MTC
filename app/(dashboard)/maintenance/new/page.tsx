"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, CustomerSelector, FormField, SectionCard } from "@/components/shared";
import { DEVICE_TYPE_LABELS } from "@/lib/constants";
import type { DeviceType, TicketPriority } from "@prisma/client";

const DEVICE_TYPES = Object.entries(DEVICE_TYPE_LABELS) as [DeviceType, string][];
const PRIORITIES: Array<{ value: TicketPriority; label: string }> = [
  { value: "LOW", label: "منخفضة" },
  { value: "NORMAL", label: "عادية" },
  { value: "HIGH", label: "عالية" },
  { value: "URGENT", label: "عاجلة" },
];

function NewTicketForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customerId, setCustomerId] = useState(searchParams.get("customerId") ?? "");
  const [form, setForm] = useState({
    deviceType: "MOBILE" as DeviceType,
    deviceBrand: "",
    deviceModel: "",
    serialNumber: "",
    problemDescription: "",
    priority: "NORMAL" as TicketPriority,
    estimatedCost: "",
    depositPaid: "",
    estimatedDelivery: "",
    customerNotes: "",
    technicianNotes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { setError("يجب اختيار العميل"); return; }
    if (!form.problemDescription.trim()) { setError("وصف المشكلة مطلوب"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          deviceType: form.deviceType,
          deviceBrand: form.deviceBrand || undefined,
          deviceModel: form.deviceModel || undefined,
          serialNumber: form.serialNumber || undefined,
          problemDescription: form.problemDescription,
          priority: form.priority,
          estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : undefined,
          depositPaid: form.depositPaid ? parseFloat(form.depositPaid) : 0,
          estimatedDelivery: form.estimatedDelivery || undefined,
          customerNotes: form.customerNotes || undefined,
          technicianNotes: form.technicianNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "حدث خطأ"); return; }
      router.push(`/maintenance/${data.id}`);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="تذكرة صيانة جديدة"
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الصيانة", href: "/maintenance" },
          { label: "تذكرة جديدة" },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Customer */}
        <SectionCard title="العميل">
          <FormField label="العميل" required>
            <CustomerSelector value={customerId} onChange={(id) => setCustomerId(id)} />
          </FormField>
        </SectionCard>

        {/* Device info */}
        <SectionCard title="بيانات الجهاز">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="نوع الجهاز" required>
              <select
                value={form.deviceType}
                onChange={(e) => set("deviceType", e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
              >
                {DEVICE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
            <FormField label="الأولوية">
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98]"
              >
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </FormField>
            <FormField label="الماركة">
              <Input value={form.deviceBrand} onChange={(e) => set("deviceBrand", e.target.value)} placeholder="Samsung, Apple, HP..." />
            </FormField>
            <FormField label="الموديل">
              <Input value={form.deviceModel} onChange={(e) => set("deviceModel", e.target.value)} placeholder="Galaxy S24, iPhone 15..." />
            </FormField>
            <FormField label="الرقم التسلسلي">
              <Input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} placeholder="IMEI أو Serial" dir="ltr" />
            </FormField>
          </div>
        </SectionCard>

        {/* Problem */}
        <SectionCard title="وصف المشكلة">
          <div className="space-y-4">
            <FormField label="المشكلة" required>
              <Textarea
                value={form.problemDescription}
                onChange={(e) => set("problemDescription", e.target.value)}
                placeholder="اشرح المشكلة التي يعاني منها الجهاز..."
                rows={3}
                autoFocus
              />
            </FormField>
            <FormField label="ملاحظات العميل">
              <Textarea
                value={form.customerNotes}
                onChange={(e) => set("customerNotes", e.target.value)}
                placeholder="ملاحظات يريد العميل إضافتها..."
                rows={2}
              />
            </FormField>
            <FormField label="ملاحظات الفني">
              <Textarea
                value={form.technicianNotes}
                onChange={(e) => set("technicianNotes", e.target.value)}
                placeholder="ملاحظات داخلية للفني..."
                rows={2}
              />
            </FormField>
          </div>
        </SectionCard>

        {/* Pricing & Delivery */}
        <SectionCard title="التسعير والموعد">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="التكلفة المتوقعة (₪)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedCost}
                onChange={(e) => set("estimatedCost", e.target.value)}
                placeholder="0.00"
                dir="ltr"
              />
            </FormField>
            <FormField label="العربون المدفوع (₪)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.depositPaid}
                onChange={(e) => set("depositPaid", e.target.value)}
                placeholder="0.00"
                dir="ltr"
              />
            </FormField>
            <FormField label="الموعد المتوقع للتسليم">
              <Input
                type="date"
                value={form.estimatedDelivery}
                onChange={(e) => set("estimatedDelivery", e.target.value)}
                dir="ltr"
              />
            </FormField>
          </div>
        </SectionCard>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>إلغاء</Button>
          <Button type="submit" disabled={loading}>
            {loading ? "جاري الحفظ..." : "إنشاء التذكرة"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewTicketPage() {
  return (
    <Suspense>
      <NewTicketForm />
    </Suspense>
  );
}
