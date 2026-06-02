"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PageHeader,
  CustomerSelector,
  FormField,
  SectionCard,
  LoadingSkeleton,
  useToast,
} from "@/components/shared";
import { DEVICE_TYPE_LABELS } from "@/lib/constants";
import type { DeviceType, TicketPriority, TicketStatus } from "@prisma/client";

const DEVICE_TYPES = Object.entries(DEVICE_TYPE_LABELS) as [DeviceType, string][];
const PRIORITIES: Array<{ value: TicketPriority; label: string }> = [
  { value: "LOW", label: "منخفضة" },
  { value: "NORMAL", label: "عادية" },
  { value: "HIGH", label: "عالية" },
  { value: "URGENT", label: "عاجلة" },
];

interface LoadedTicket {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  priority: TicketPriority;
  deviceType: DeviceType;
  deviceBrand: string | null;
  deviceModel: string | null;
  serialNumber: string | null;
  problemDescription: string;
  diagnosis: string | null;
  solution: string | null;
  estimatedCost: number | string | null;
  finalCost: number | string | null;
  depositPaid: number | string;
  technicianNotes: string | null;
  customerNotes: string | null;
  estimatedDelivery: string | null;
  customer: { id: string; name: string };
  invoice: { id: string; invoiceNumber: string } | null;
}

const toStr = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : String(Number(v));

export default function EditTicketPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = params.id;
  const { toast } = useToast();

  const [loaded, setLoaded] = useState<LoadedTicket | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState({
    deviceType: "MOBILE" as DeviceType,
    deviceBrand: "",
    deviceModel: "",
    serialNumber: "",
    problemDescription: "",
    priority: "NORMAL" as TicketPriority,
    estimatedCost: "",
    finalCost: "",
    depositPaid: "",
    estimatedDelivery: "",
    customerNotes: "",
    technicianNotes: "",
    diagnosis: "",
    solution: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) {
        setError("تعذّر تحميل التذكرة");
        return;
      }
      const data = (await res.json()) as LoadedTicket;
      setLoaded(data);
      setCustomerId(data.customer.id);
      setForm({
        deviceType: data.deviceType,
        deviceBrand: data.deviceBrand ?? "",
        deviceModel: data.deviceModel ?? "",
        serialNumber: data.serialNumber ?? "",
        problemDescription: data.problemDescription,
        priority: data.priority,
        estimatedCost: toStr(data.estimatedCost),
        finalCost: toStr(data.finalCost),
        depositPaid: toStr(data.depositPaid),
        estimatedDelivery: data.estimatedDelivery
          ? data.estimatedDelivery.slice(0, 10)
          : "",
        customerNotes: data.customerNotes ?? "",
        technicianNotes: data.technicianNotes ?? "",
        diagnosis: data.diagnosis ?? "",
        solution: data.solution ?? "",
      });
    })();
  }, [ticketId]);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!loaded) return;
    if (!customerId) {
      setError("يجب اختيار العميل");
      return;
    }
    if (!form.problemDescription.trim()) {
      setError("وصف المشكلة مطلوب");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          deviceType: form.deviceType,
          deviceBrand: form.deviceBrand,
          deviceModel: form.deviceModel,
          serialNumber: form.serialNumber,
          problemDescription: form.problemDescription,
          priority: form.priority,
          estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : null,
          finalCost: form.finalCost ? parseFloat(form.finalCost) : null,
          depositPaid: form.depositPaid ? parseFloat(form.depositPaid) : 0,
          estimatedDelivery: form.estimatedDelivery || null,
          customerNotes: form.customerNotes,
          technicianNotes: form.technicianNotes,
          diagnosis: form.diagnosis,
          solution: form.solution,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        toast(data.error ?? "حدث خطأ", "error");
        return;
      }
      toast("تم تحديث التذكرة");
      router.push(`/maintenance/${ticketId}`);
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <LoadingSkeleton />;

  const isTerminal = loaded.status === "DELIVERED" || loaded.status === "CANCELLED";
  // Customer is locked once an invoice is issued — repointing the ticket would
  // diverge from the device owner on the invoice.
  const customerLocked = !!loaded.invoice;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={`تعديل ${loaded.ticketNumber}`}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الصيانة", href: "/maintenance" },
          { label: loaded.ticketNumber, href: `/maintenance/${ticketId}` },
          { label: "تعديل" },
        ]}
      />

      {isTerminal && (
        <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 text-red-900 rounded-lg px-3 py-2">
          <span>
            هذه التذكرة {loaded.status === "DELIVERED" ? "مُسلَّمة" : "ملغاة"}. لا يمكن تعديل بياناتها.
          </span>
        </div>
      )}

      <SectionCard title="العميل">
        <FormField label="العميل" required>
          {customerLocked ? (
            <div className="space-y-1">
              <div className="h-10 px-3 flex items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-sm text-[#0b2345]">
                {loaded.customer.name}
              </div>
              <p className="text-xs text-[#94a3b8]">
                لا يمكن تغيير العميل بعد إصدار فاتورة <span className="ltr">{loaded.invoice?.invoiceNumber}</span>.
              </p>
            </div>
          ) : (
            <CustomerSelector value={customerId} onChange={setCustomerId} />
          )}
        </FormField>
      </SectionCard>

      <SectionCard title="بيانات الجهاز">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="نوع الجهاز" required>
            <select
              value={form.deviceType}
              onChange={(e) => set("deviceType", e.target.value)}
              disabled={isTerminal}
              className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
            >
              {DEVICE_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الأولوية">
            <select
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              disabled={isTerminal}
              className="w-full h-10 px-3 rounded-lg border border-[#e2e8f0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#104e98] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="الماركة">
            <Input
              value={form.deviceBrand}
              onChange={(e) => set("deviceBrand", e.target.value)}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="الموديل">
            <Input
              value={form.deviceModel}
              onChange={(e) => set("deviceModel", e.target.value)}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="الرقم التسلسلي">
            <Input
              value={form.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
              disabled={isTerminal}
              dir="ltr"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="المشكلة والتشخيص">
        <div className="space-y-4">
          <FormField label="وصف المشكلة" required>
            <Textarea
              value={form.problemDescription}
              onChange={(e) => set("problemDescription", e.target.value)}
              rows={3}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="التشخيص">
            <Textarea
              value={form.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
              rows={3}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="الحل">
            <Textarea
              value={form.solution}
              onChange={(e) => set("solution", e.target.value)}
              rows={3}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="ملاحظات العميل">
            <Textarea
              value={form.customerNotes}
              onChange={(e) => set("customerNotes", e.target.value)}
              rows={2}
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="ملاحظات الفني">
            <Textarea
              value={form.technicianNotes}
              onChange={(e) => set("technicianNotes", e.target.value)}
              rows={2}
              disabled={isTerminal}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="التسعير والموعد">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="التكلفة المتوقعة (₪)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.estimatedCost}
              onChange={(e) => set("estimatedCost", e.target.value)}
              dir="ltr"
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="التكلفة النهائية (₪)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.finalCost}
              onChange={(e) => set("finalCost", e.target.value)}
              dir="ltr"
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="العربون المدفوع (₪)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.depositPaid}
              onChange={(e) => set("depositPaid", e.target.value)}
              dir="ltr"
              disabled={isTerminal}
            />
          </FormField>
          <FormField label="الموعد المتوقع للتسليم">
            <Input
              type="date"
              value={form.estimatedDelivery}
              onChange={(e) => set("estimatedDelivery", e.target.value)}
              dir="ltr"
              disabled={isTerminal}
            />
          </FormField>
        </div>
      </SectionCard>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pb-8">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          إلغاء
        </Button>
        <Button onClick={save} disabled={saving || isTerminal}>
          {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </div>
  );
}
