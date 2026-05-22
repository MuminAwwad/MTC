import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        customer: true,
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        debts: {
          where: { isDeleted: false },
          include: { payments: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    return ok(invoice);
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
    const { status: newStatus, notes } = body;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { items: true, debts: { where: { isDeleted: false } } },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });

    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      DRAFT: ["ISSUED", "CANCELLED"],
      ISSUED: ["PARTIAL", "PAID", "CANCELLED"],
      PARTIAL: ["PAID", "CANCELLED"],
      PAID: [],
      CANCELLED: [],
    };

    if (newStatus && !validTransitions[invoice.status].includes(newStatus)) {
      return ok({ error: "تحويل الحالة غير مسموح" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newStatus === "ISSUED" && invoice.status === "DRAFT") {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await decrementStockOrFail(tx, item.productId, item.qty);
            await tx.stockMovement.create({
              data: {
                ownerId: ctx.dbUser.id,
                productId: item.productId,
                createdById: ctx.dbUser.id,
                type: "OUT",
                qty: item.qty,
                note: `فاتورة ${invoice.invoiceNumber}`,
                reference: invoice.invoiceNumber,
              },
            });
          }
        }

        const remaining = Number(invoice.remainingAmount);
        if (remaining > 0 && invoice.debts.length === 0) {
          await tx.debt.create({
            data: {
              ownerId: ctx.dbUser.id,
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              amount: remaining,
              currency: invoice.currency,
              reason: `فاتورة ${invoice.invoiceNumber}`,
              status: "PENDING",
            },
          });
        }

        if (invoice.ticketId) {
          await tx.maintenanceTicket.update({
            where: { id: invoice.ticketId },
            data: { status: "DELIVERED", deliveredAt: new Date() },
          });
          await tx.ticketUpdate.create({
            data: {
              ticketId: invoice.ticketId,
              status: "DELIVERED",
              note: `تم التسليم وإصدار الفاتورة ${invoice.invoiceNumber}`,
              createdById: ctx.dbUser.id,
            },
          });
        }
      }

      if (newStatus === "CANCELLED" && invoice.status !== "DRAFT") {
        for (const item of invoice.items) {
          if (item.productId && item.qty > 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stockQty: { increment: item.qty } },
            });
            await tx.stockMovement.create({
              data: {
                ownerId: ctx.dbUser.id,
                productId: item.productId,
                createdById: ctx.dbUser.id,
                type: "IN",
                qty: item.qty,
                note: `إلغاء فاتورة ${invoice.invoiceNumber}`,
                reference: invoice.invoiceNumber,
              },
            });
          }
        }

        // Soft-delete any debt auto-created when the invoice was issued.
        // Existing DebtPayment rows stay as the historical record — refunds
        // (if any) are a separate accounting decision.
        await tx.debt.updateMany({
          where: { invoiceId: id, isDeleted: false },
          data: { isDeleted: true },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(newStatus ? { status: newStatus as InvoiceStatus } : {}),
          ...(notes !== undefined ? { notes } : {}),
          // A cancelled invoice owes nothing. total / paidAmount stay for
          // historical reference (and any refund tracking later).
          ...(newStatus === "CANCELLED" ? { remainingAmount: 0 } : {}),
        },
        include: {
          customer: true,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          debts: { where: { isDeleted: false }, include: { payments: true } },
        },
      });
    });

    return ok(updated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return ok({ error: e.message }, { status: 409 });
    }
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    if (invoice.status !== "DRAFT") {
      return ok({ error: "يمكن حذف المسودات فقط" }, { status: 400 });
    }
    await prisma.invoice.update({ where: { id }, data: { isDeleted: true } });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
