import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({
      where: { id, isDeleted: false },
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
      where: { id, isDeleted: false },
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
              customerId: invoice.customerId,
              invoiceId: invoice.id,
              amount: remaining,
              currency: invoice.currency,
              reason: `فاتورة ${invoice.invoiceNumber}`,
              status: "PENDING",
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
      }

      return tx.invoice.update({
        where: { id },
        data: {
          ...(newStatus ? { status: newStatus as InvoiceStatus } : {}),
          ...(notes !== undefined ? { notes } : {}),
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
  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findFirst({ where: { id, isDeleted: false } });
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
