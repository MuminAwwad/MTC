import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { TicketStatus } from "@prisma/client";

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  RECEIVED: ["DIAGNOSING", "CANCELLED"],
  DIAGNOSING: ["IN_REPAIR", "WAITING_PARTS", "READY", "CANCELLED"],
  IN_REPAIR: ["WAITING_PARTS", "READY", "CANCELLED"],
  WAITING_PARTS: ["IN_REPAIR", "READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, isDeleted: false },
      include: {
        customer: true,
        parts: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: "asc" } },
        timeline: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });
    return ok(ticket);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      status: newStatus,
      note,
      diagnosis,
      solution,
      finalCost,
      estimatedCost,
      technicianNotes,
      customerNotes,
      estimatedDelivery,
    } = body;

    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, isDeleted: false } });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    if (newStatus && !VALID_TRANSITIONS[ticket.status].includes(newStatus)) {
      return ok({ error: "تحويل الحالة غير مسموح" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (newStatus) data.status = newStatus;
      if (diagnosis !== undefined) data.diagnosis = diagnosis;
      if (solution !== undefined) data.solution = solution;
      if (finalCost !== undefined) data.finalCost = finalCost;
      if (estimatedCost !== undefined) data.estimatedCost = estimatedCost;
      if (technicianNotes !== undefined) data.technicianNotes = technicianNotes;
      if (customerNotes !== undefined) data.customerNotes = customerNotes;
      if (estimatedDelivery !== undefined) data.estimatedDelivery = estimatedDelivery ? new Date(estimatedDelivery) : null;
      if (newStatus === "DELIVERED") data.deliveredAt = new Date();

      const result = await tx.maintenanceTicket.update({
        where: { id },
        data,
        include: {
          customer: true,
          parts: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: "asc" } },
          timeline: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
        },
      });

      if (newStatus) {
        await tx.ticketUpdate.create({
          data: { ticketId: id, status: newStatus as TicketStatus, note: note || null },
        });
      }

      return result;
    });

    return ok(updated);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, isDeleted: false } });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });
    if (!["RECEIVED", "CANCELLED"].includes(ticket.status)) {
      return ok({ error: "لا يمكن حذف تذكرة نشطة" }, { status: 400 });
    }
    await prisma.maintenanceTicket.update({ where: { id }, data: { isDeleted: true } });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
