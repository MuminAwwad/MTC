"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Wrench, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SearchInput,
  StatusBadge,
  Pagination,
  EmptyState,
  CardSkeleton,
  ExportMenu,
} from "@/components/shared";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  DEVICE_TYPE_LABELS,
  ITEMS_PER_PAGE,
} from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import type { TicketStatus, TicketPriority, DeviceType } from "@prisma/client";

interface TicketRow {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  priority: TicketPriority;
  deviceType: DeviceType;
  deviceBrand: string | null;
  deviceModel: string | null;
  estimatedDelivery: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null };
  _count: { parts: number; timeline: number };
}

const STATUSES: Array<{ value: TicketStatus | ""; label: string }> = [
  { value: "", label: "الكل" },
  { value: "RECEIVED", label: "مستلم" },
  { value: "DIAGNOSING", label: "تشخيص" },
  { value: "IN_REPAIR", label: "إصلاح" },
  { value: "WAITING_PARTS", label: "انتظار قطع" },
  { value: "READY", label: "جاهز" },
  { value: "DELIVERED", label: "مُسلَّم" },
];

export default function MaintenancePage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      ...(status ? { status } : {}),
    });
    const res = await fetch(`/api/tickets?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
      setTotal(data.total);
      setTotalPages(data.pageCount);
    }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status]);

  const isOverdue = (t: TicketRow) =>
    t.estimatedDelivery &&
    new Date(t.estimatedDelivery) < new Date() &&
    !["DELIVERED", "CANCELLED"].includes(t.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الصيانة"
        subtitle={`${total} تذكرة`}
        action={
          <div className="flex gap-2 flex-wrap">
            <ExportMenu type="tickets" params={{ search, status }} />
            <Link href="/maintenance/new">
              <Button className="gap-2"><Plus className="h-4 w-4" />تذكرة جديدة</Button>
            </Link>
          </div>
        }
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "الصيانة" }]}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput onSearch={setSearch} placeholder="بحث برقم التذكرة أو العميل أو الجهاز..." className="w-72" />
        <div className="flex gap-1 bg-[#f1f5f9] rounded-lg p-1 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium whitespace-nowrap transition-all ${
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
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="لا توجد تذاكر صيانة"
          description="أنشئ أول تذكرة صيانة للبدء"
          action={{ label: "تذكرة جديدة", onClick: () => router.push("/maintenance/new") }}
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className={`bg-white rounded-xl border p-4 ${isOverdue(t) ? "border-red-200 bg-red-50/40" : "border-[#e2e8f0]"}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link href={`/maintenance/${t.id}`} className="font-bold text-[#104e98] hover:underline ltr">
                    {t.ticketNumber}
                  </Link>
                  <StatusBadge status={{ type: "ticket", status: t.status }} />
                </div>
                <Link href={`/customers/${t.customer.id}`} className="block text-sm font-medium text-[#1e293b] hover:text-[#104e98] mb-1">
                  {t.customer.name}
                </Link>
                <div className="text-xs text-[#64748b] mb-2">
                  {DEVICE_TYPE_LABELS[t.deviceType]}
                  {(t.deviceBrand || t.deviceModel) && <span className="text-[#94a3b8]"> · {[t.deviceBrand, t.deviceModel].filter(Boolean).join(" ")}</span>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${TICKET_PRIORITY_COLORS[t.priority]}`}>
                    {TICKET_PRIORITY_LABELS[t.priority]}
                  </span>
                  <div className="flex items-center gap-3 text-[#94a3b8]">
                    {t.estimatedDelivery && (
                      <span className={`flex items-center gap-1 ${isOverdue(t) ? "text-red-600 font-medium" : ""}`}>
                        {isOverdue(t) && <Clock className="h-3 w-3" />}
                        {formatDate(t.estimatedDelivery)}
                      </span>
                    )}
                    <span>{formatDate(t.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">رقم التذكرة</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">العميل</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الجهاز</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الأولوية</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الموعد</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">تاريخ الاستلام</th>
                  <th className="text-right px-4 py-3 font-medium text-[#64748b]">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {tickets.map((t) => (
                  <tr key={t.id} className={`hover:bg-[#f8fafc] transition-colors ${isOverdue(t) ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/maintenance/${t.id}`} className="font-medium text-[#104e98] hover:underline ltr">
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${t.customer.id}`} className="text-[#1e293b] hover:text-[#104e98]">
                        {t.customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#64748b]">
                      <span>{DEVICE_TYPE_LABELS[t.deviceType]}</span>
                      {(t.deviceBrand || t.deviceModel) && (
                        <span className="text-xs text-[#94a3b8] block">
                          {[t.deviceBrand, t.deviceModel].filter(Boolean).join(" ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TICKET_PRIORITY_COLORS[t.priority]}`}>
                        {TICKET_PRIORITY_LABELS[t.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.estimatedDelivery ? (
                        <span className={`flex items-center gap-1 text-sm ${isOverdue(t) ? "text-red-600 font-medium" : "text-[#64748b]"}`}>
                          {isOverdue(t) && <Clock className="h-3.5 w-3.5" />}
                          {formatDate(t.estimatedDelivery)}
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#64748b]">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={{ type: "ticket", status: t.status }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} limit={ITEMS_PER_PAGE} onPageChange={setPage} />
      )}
    </div>
  );
}
