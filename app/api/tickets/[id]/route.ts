import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { TicketStatus, TicketPriority, DeviceType } from "@prisma/client";
import { requireUser } from "@/lib/auth";

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
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        customer: true,
        parts: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: "asc" } },
        timeline: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
        createdBy: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
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
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

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
      // Identity / device fields — editable while the ticket is open. Changing
      // them on a delivered/cancelled ticket is blocked below.
      customerId,
      deviceType,
      deviceBrand,
      deviceModel,
      serialNumber,
      problemDescription,
      priority,
      depositPaid,
    } = body;

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { invoice: { select: { id: true } } },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    if (newStatus && !VALID_TRANSITIONS[ticket.status].includes(newStatus)) {
      return ok({ error: "تحويل الحالة غير مسموح" }, { status: 400 });
    }

    const identityFields = {
      customerId,
      deviceType,
      deviceBrand,
      deviceModel,
      serialNumber,
      problemDescription,
      priority,
      depositPaid,
    };
    const isIdentityEdit = Object.values(identityFields).some((v) => v !== undefined);
    if (isIdentityEdit && (ticket.status === "DELIVERED" || ticket.status === "CANCELLED")) {
      return ok(
        { error: "لا يمكن تعديل تذكرة مُسلَّمة أو ملغاة" },
        { status: 400 }
      );
    }
    // The invoice was issued against the original customer/device — repointing
    // it now would create a mismatch with the device owner on file.
    if (
      ticket.invoice &&
      customerId !== undefined &&
      customerId !== ticket.customerId
    ) {
      return ok(
        { error: "لا يمكن تغيير العميل بعد إصدار فاتورة للتذكرة" },
        { status: 400 }
      );
    }
    if (customerId !== undefined && customerId !== ticket.customerId) {
      const target = await prisma.customer.findFirst({
        where: { id: customerId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!target) return ok({ error: "العميل غير موجود" }, { status: 404 });
    }
    if (problemDescription !== undefined && !String(problemDescription).trim()) {
      return ok({ error: "وصف المشكلة مطلوب" }, { status: 400 });
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
      if (customerId !== undefined) data.customerId = customerId;
      if (deviceType !== undefined) data.deviceType = deviceType as DeviceType;
      if (deviceBrand !== undefined) data.deviceBrand = deviceBrand || null;
      if (deviceModel !== undefined) data.deviceModel = deviceModel || null;
      if (serialNumber !== undefined) data.serialNumber = serialNumber || null;
      if (problemDescription !== undefined) data.problemDescription = problemDescription;
      if (priority !== undefined) data.priority = priority as TicketPriority;
      if (depositPaid !== undefined) data.depositPaid = depositPaid;
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
          data: {
            ticketId: id,
            status: newStatus as TicketStatus,
            note: note || null,
            createdById: ctx.dbUser.id,
          },
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

/**
 * Delete a ticket in any status. Any parts that were drawn from stock get
 * returned to inventory. The linked invoice (if any) is left alone — it can
 * still stand on its own; the user can delete it separately if desired.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { parts: true },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      for (const part of ticket.parts) {
        if (part.productId && part.qty > 0) {
          await tx.product.update({
            where: { id: part.productId },
            data: { stockQty: { increment: part.qty } },
          });
          await tx.stockMovement.create({
            data: {
              ownerId: ctx.dbUser.id,
              productId: part.productId,
              createdById: ctx.dbUser.id,
              type: "IN",
              qty: part.qty,
              note: `حذف تذكرة ${ticket.ticketNumber}`,
              reference: ticket.ticketNumber,
            },
          });
        }
      }
      await tx.maintenanceTicket.update({ where: { id }, data: { isDeleted: true } });
    });

    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
