"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Printer, ChevronLeft, ChevronRight, Plus, Trash2,
  CheckCircle2, Clock, Package, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PageHeader, StatusBadge, SectionCard, LoadingSkeleton,
  ConfirmDialog, CurrencyDisplay, FormField, useToast,
} from "@/components/shared";
import { ProductLineSelector } from "@/components/invoices/ProductLineSelector";
import {
  TICKET_STATUS_LABELS, TICKET_FLOW,
  DEVICE_TYPE_LABELS, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/formatters";
import type { TicketStatus, TicketPriority, DeviceType } from "@prisma/client";

interface TicketPart {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  total: number;
  product: { id: string; name: string; sku: string | null } | null;
}

interface TimelineEntry {
  id: string;
  status: TicketStatus;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

interface TicketDetail {
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
  estimatedCost: number | null;
  finalCost: number | null;
  depositPaid: number;
  technicianNotes: string | null;
  customerNotes: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null; address: string | null };
  parts: TicketPart[];
  timeline: TimelineEntry[];
}

const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["IN_REPAIR", "WAITING_PARTS", "READY", "CANCELLED"],
  IN_REPAIR: ["WAITING_PARTS", "READY", "CANCELLED"],
  WAITING_PARTS: ["IN_REPAIR", "READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const STATUS_ICONS: Record<TicketStatus, React.ReactNode> = {
  RECEIVED: <Clock className="h-4 w-4" />,
  DIAGNOSING: <Clock className="h-4 w-4" />,
  IN_REPAIR: <Clock className="h-4 w-4" />,
  WAITING_PARTS: <Package className="h-4 w-4" />,
  READY: <CheckCircle2 className="h-4 w-4" />,
  DELIVERED: <CheckCircle2 className="h-4 w-4" />,
  CANCELLED: <Clock className="h-4 w-4" />,
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Status transition
  const [statusNote, setStatusNote] = useState("");
  const [statusLoading, setStatusLoading] = useState<TicketStatus | null>(null);

  // Parts
  const [partName, setPartName] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partCost, setPartCost] = useState("");
  const [partProductId, setPartProductId] = useState("");
  const [addingPart, setAddingPart] = useState(false);
  const [showPartForm, setShowPartForm] = useState(false);
  const [deletePartId, setDeletePartId] = useState("");

  // Timeline note
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Edit fields
  const [editDiagnosis, setEditDiagnosis] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [editSolution, setEditSolution] = useState(false);
  const [solution, setSolution] = useState("");
  const [finalCost, setFinalCost] = useState("");
  const [savingField, setSavingField] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    if (res.ok) {
      const t = await res.json();
      setTicket(t);
      setDiagnosis(t.diagnosis ?? "");
      setSolution(t.solution ?? "");
      setFinalCost(t.finalCost ? String(Number(t.finalCost)) : "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (newStatus: TicketStatus) => {
    setStatusLoading(newStatus);
    setError("");
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, note: statusNote || undefined }),
    });
    if (res.ok) { setTicket(await res.json()); setStatusNote(""); toast(`تم تغيير الحالة إلى ${TICKET_STATUS_LABELS[newStatus]}`); }
    else { const d = await res.json(); setError(d.error ?? "حدث خطأ"); toast(d.error ?? "حدث خطأ", "error"); }
    setStatusLoading(null);
  };

  const saveField = async (field: string, value: unknown) => {
    setSavingField(true);
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) { setTicket(await res.json()); }
    setSavingField(false);
  };

  const addPart = async () => {
    if (!partName.trim()) return;
    setAddingPart(true);
    const res = await fetch(`/api/tickets/${id}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: partProductId || undefined,
        name: partName,
        qty: parseInt(partQty) || 1,
        unitCost: parseFloat(partCost) || 0,
      }),
    });
    if (res.ok) {
      const part = await res.json();
      setTicket((t) => t ? { ...t, parts: [...t.parts, part] } : t);
      setPartName(""); setPartQty("1"); setPartCost(""); setPartProductId(""); setShowPartForm(false);
      toast("تمت إضافة القطعة");
    } else { const d = await res.json(); setError(d.error ?? "حدث خطأ"); toast(d.error ?? "حدث خطأ", "error"); }
    setAddingPart(false);
  };

  const deletePart = async () => {
    const res = await fetch(`/api/tickets/${id}/parts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partId: deletePartId }),
    });
    if (res.ok) {
      setTicket((t) => t ? { ...t, parts: t.parts.filter((p) => p.id !== deletePartId) } : t);
    }
    setDeletePartId("");
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    const res = await fetch(`/api/tickets/${id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    if (res.ok) {
      const entry = await res.json();
      setTicket((t) => t ? { ...t, timeline: [...t.timeline, entry] } : t);
      setNoteText("");
    }
    setAddingNote(false);
  };

  if (loading) return <LoadingSkeleton />;
  if (!ticket) return <div className="text-center py-20 text-[#64748b]">التذكرة غير موجودة</div>;

  const nextStatuses = NEXT_STATUSES[ticket.status];
  const partsTotal = ticket.parts.reduce((s, p) => s + Number(p.total), 0);
  const currentFlowIndex = TICKET_FLOW.indexOf(ticket.status);
  const isTerminal = ticket.status === "DELIVERED" || ticket.status === "CANCELLED";

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={ticket.ticketNumber}
        subtitle={`${DEVICE_TYPE_LABELS[ticket.deviceType]}${ticket.deviceBrand ? " · " + ticket.deviceBrand : ""}${ticket.deviceModel ? " " + ticket.deviceModel : ""}`}
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "الصيانة", href: "/maintenance" },
          { label: ticket.ticketNumber },
        ]}
        action={
          <div className="flex gap-2">
            <Link href={`/print/tickets/${id}`} target="_blank">
              <Button variant="outline" className="gap-2"><Printer className="h-4 w-4" />وصل استلام</Button>
            </Link>
          </div>
        }
      />

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Status flow progress */}
      {!isTerminal && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
          <div className="flex items-center gap-1 mb-4">
            {TICKET_FLOW.map((s, i) => (
              <div key={s} className="flex items-center flex-1 min-w-0">
                <div className={`flex flex-col items-center flex-1 ${i <= currentFlowIndex ? "text-[#104e98]" : "text-[#94a3b8]"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                    i < currentFlowIndex ? "bg-[#104e98] text-white" :
                    i === currentFlowIndex ? "bg-[#104e98] text-white ring-4 ring-[#e8f0fc]" :
                    "bg-[#f1f5f9] text-[#94a3b8]"
                  }`}>
                    {i < currentFlowIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] text-center hidden sm:block leading-tight">{TICKET_STATUS_LABELS[s]}</span>
                </div>
                {i < TICKET_FLOW.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${i < currentFlowIndex ? "bg-[#104e98]" : "bg-[#e2e8f0]"}`} />
                )}
              </div>
            ))}
          </div>

          {nextStatuses.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2 flex-wrap">
                {nextStatuses.filter((s) => s !== "CANCELLED").map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    onClick={() => changeStatus(s)}
                    disabled={!!statusLoading}
                  >
                    {statusLoading === s ? "..." : `→ ${TICKET_STATUS_LABELS[s]}`}
                  </Button>
                ))}
                {nextStatuses.includes("CANCELLED") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => changeStatus("CANCELLED")}
                    disabled={!!statusLoading}
                  >
                    إلغاء التذكرة
                  </Button>
                )}
              </div>
              <Input
                placeholder="ملاحظة تغيير الحالة (اختياري)..."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className="text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "الحالة", value: <StatusBadge status={{ type: "ticket", status: ticket.status }} /> },
          { label: "الأولوية", value: <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}>{TICKET_PRIORITY_LABELS[ticket.priority]}</span> },
          { label: "الموعد المتوقع", value: ticket.estimatedDelivery ? formatDate(ticket.estimatedDelivery) : "—" },
          { label: "العربون", value: Number(ticket.depositPaid) > 0 ? `₪${Number(ticket.depositPaid).toFixed(2)}` : "—" },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-[#e2e8f0] rounded-xl p-3">
            <p className="text-xs text-[#64748b] mb-1">{item.label}</p>
            <div className="font-medium text-sm text-[#1e293b]">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Customer */}
          <SectionCard title="العميل">
            <Link href={`/customers/${ticket.customer.id}`} className="text-[#104e98] font-medium hover:underline block">
              {ticket.customer.name}
            </Link>
            {ticket.customer.phone && <p className="text-sm text-[#64748b] ltr mt-1">{ticket.customer.phone}</p>}
          </SectionCard>

          {/* Problem description */}
          <SectionCard title="وصف المشكلة">
            <p className="text-sm text-[#1e293b] whitespace-pre-line">{ticket.problemDescription}</p>
            {ticket.customerNotes && (
              <div className="mt-3 pt-3 border-t border-[#f1f5f9]">
                <p className="text-xs text-[#64748b] mb-1">ملاحظات العميل</p>
                <p className="text-sm text-[#1e293b]">{ticket.customerNotes}</p>
              </div>
            )}
          </SectionCard>

          {/* Diagnosis */}
          <SectionCard title="التشخيص والحل">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-[#64748b]">التشخيص</p>
                  <button onClick={() => setEditDiagnosis(!editDiagnosis)} className="text-xs text-[#104e98]">
                    {editDiagnosis ? "إلغاء" : "تعديل"}
                  </button>
                </div>
                {editDiagnosis ? (
                  <div className="space-y-2">
                    <Textarea rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                    <Button size="sm" disabled={savingField} onClick={async () => { await saveField("diagnosis", diagnosis); setEditDiagnosis(false); }}>
                      {savingField ? "..." : "حفظ"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[#1e293b] whitespace-pre-line">{ticket.diagnosis || <span className="text-[#94a3b8]">لم يُضف بعد</span>}</p>
                )}
              </div>
              <div className="border-t border-[#f1f5f9] pt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-[#64748b]">الحل</p>
                  <button onClick={() => setEditSolution(!editSolution)} className="text-xs text-[#104e98]">
                    {editSolution ? "إلغاء" : "تعديل"}
                  </button>
                </div>
                {editSolution ? (
                  <div className="space-y-2">
                    <Textarea rows={3} value={solution} onChange={(e) => setSolution(e.target.value)} />
                    <Button size="sm" disabled={savingField} onClick={async () => { await saveField("solution", solution); setEditSolution(false); }}>
                      {savingField ? "..." : "حفظ"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[#1e293b] whitespace-pre-line">{ticket.solution || <span className="text-[#94a3b8]">لم يُضف بعد</span>}</p>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Costs */}
          <SectionCard title="التكاليف">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748b]">التكلفة المتوقعة</span>
                <span>{ticket.estimatedCost ? `₪${Number(ticket.estimatedCost).toFixed(2)}` : "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748b]">التكلفة النهائية</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={finalCost}
                    onChange={(e) => setFinalCost(e.target.value)}
                    className="w-28 h-8 text-sm"
                    dir="ltr"
                    placeholder="0.00"
                  />
                  <Button size="sm" variant="outline" onClick={() => saveField("finalCost", finalCost ? parseFloat(finalCost) : null)} disabled={savingField}>
                    {savingField ? "..." : "حفظ"}
                  </Button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">قطع الغيار</span>
                <span>₪{partsTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">العربون المدفوع</span>
                <span className="text-green-600">₪{Number(ticket.depositPaid).toFixed(2)}</span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Parts */}
          <SectionCard title={`قطع الغيار (${ticket.parts.length})`}>
            {ticket.parts.length > 0 && (
              <ul className="divide-y divide-[#f1f5f9] mb-3">
                {ticket.parts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-[#1e293b]">{p.name}</span>
                      <span className="text-[#94a3b8] text-xs mr-1">× {p.qty}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium ltr">₪{Number(p.total).toFixed(2)}</span>
                      <button onClick={() => setDeletePartId(p.id)} className="text-[#94a3b8] hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                <li className="flex justify-between pt-2 text-sm font-semibold text-[#0b2345]">
                  <span>الإجمالي</span>
                  <span className="ltr">₪{partsTotal.toFixed(2)}</span>
                </li>
              </ul>
            )}

            {showPartForm ? (
              <div className="space-y-2 bg-[#f8fafc] rounded-lg p-3">
                <ProductLineSelector
                  onSelect={(p) => { setPartProductId(p.id); setPartName(p.name); setPartCost(String(Number(p.sellPrice))); }}
                  placeholder="ابحث في المخزون..."
                />
                <Input placeholder="اسم القطعة *" value={partName} onChange={(e) => setPartName(e.target.value)} className="text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min="1" placeholder="الكمية" value={partQty} onChange={(e) => setPartQty(e.target.value)} dir="ltr" className="text-sm" />
                  <Input type="number" min="0" step="0.01" placeholder="سعر الوحدة (₪)" value={partCost} onChange={(e) => setPartCost(e.target.value)} dir="ltr" className="text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addPart} disabled={addingPart}>{addingPart ? "..." : "إضافة"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPartForm(false)}>إلغاء</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowPartForm(true)}
                className="flex items-center gap-2 text-sm text-[#104e98] hover:underline font-medium"
              >
                <Plus className="h-4 w-4" />إضافة قطعة
              </button>
            )}
          </SectionCard>

          {/* Timeline */}
          <SectionCard title="سجل التحديثات">
            <div className="space-y-0">
              {ticket.timeline.map((entry, i) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      i === ticket.timeline.length - 1 ? "bg-[#104e98] text-white" : "bg-[#f1f5f9] text-[#94a3b8]"
                    }`}>
                      {STATUS_ICONS[entry.status]}
                    </div>
                    {i < ticket.timeline.length - 1 && <div className="w-0.5 h-full bg-[#f1f5f9] my-1 min-h-[16px]" />}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-[#1e293b]">{TICKET_STATUS_LABELS[entry.status]}</span>
                      <span className="text-[10px] text-[#94a3b8] flex-shrink-0">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    {entry.note && <p className="text-xs text-[#64748b] mt-0.5">{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>

            {/* Add note */}
            <div className="pt-2 border-t border-[#f1f5f9] flex gap-2">
              <Input
                placeholder="إضافة ملاحظة..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                className="text-sm"
              />
              <Button size="sm" onClick={addNote} disabled={addingNote || !noteText.trim()}>
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={!!deletePartId}
        onClose={() => setDeletePartId("")}
        onConfirm={deletePart}
        title="حذف القطعة"
        description="هل أنت متأكد من حذف هذه القطعة؟ سيتم إعادة الكمية للمخزون."
        variant="danger"
      />
    </div>
  );
}
