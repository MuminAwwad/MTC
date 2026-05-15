import Link from "next/link";
import { SectionCard, StatusBadge } from "@/components/shared";
import { formatDate } from "@/lib/formatters";
import { DEVICE_TYPE_LABELS } from "@/lib/constants";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { TicketStatus, TicketPriority } from "@prisma/client";

async function getRecentTickets() {
  return prisma.maintenanceTicket.findMany({
    where: { isDeleted: false },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function RecentTickets() {
  let tickets: Awaited<ReturnType<typeof getRecentTickets>> = [];

  try {
    tickets = await getRecentTickets();
  } catch {
    // DB not connected
  }

  return (
    <SectionCard
      title="آخر تذاكر الصيانة"
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/maintenance" className="flex items-center gap-1 text-[#104e98]">
            عرض الكل <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </Button>
      }
      noPadding
    >
      {tickets.length === 0 ? (
        <p className="text-sm text-[#64748b] text-center py-8">لا توجد تذاكر بعد</p>
      ) : (
        <div className="divide-y divide-[#f8fafc]">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/maintenance/${ticket.id}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-[#fafbfc] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[#1e293b]">
                  {ticket.customer.name}
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">
                  {ticket.ticketNumber} ·{" "}
                  {DEVICE_TYPE_LABELS[ticket.deviceType]}
                  {ticket.deviceBrand && ` · ${ticket.deviceBrand}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={{
                    type: "priority",
                    status: ticket.priority as TicketPriority,
                  }}
                />
                <StatusBadge
                  status={{ type: "ticket", status: ticket.status as TicketStatus }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
