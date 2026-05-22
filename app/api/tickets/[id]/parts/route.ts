import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    const parts = await prisma.ticketPart.findMany({
      where: { ticketId: id },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: "asc" },
    });
    return ok(parts);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const { productId, name, qty, unitCost } = await req.json();

    if (!name?.trim()) return ok({ error: "اسم القطعة مطلوب" }, { status: 400 });
    if (!qty || qty < 1) return ok({ error: "الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });
    if (unitCost === undefined || unitCost < 0) return ok({ error: "السعر غير صالح" }, { status: 400 });

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    if (productId) {
      const product = await prisma.product.findFirst({
        where: { id: productId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!product) return ok({ error: "المنتج غير موجود" }, { status: 404 });
    }

    const total = qty * unitCost;

    const part = await prisma.$transaction(async (tx) => {
      const p = await tx.ticketPart.create({
        data: {
          ticketId: id,
          productId: productId || null,
          name,
          qty,
          unitCost,
          total,
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      if (productId) {
        await decrementStockOrFail(tx, productId, qty);
        await tx.stockMovement.create({
          data: {
            ownerId: ctx.dbUser.id,
            productId,
            createdById: ctx.dbUser.id,
            type: "OUT",
            qty,
            note: `قطعة لتذكرة ${ticket.ticketNumber}`,
            reference: ticket.ticketNumber,
          },
        });
      }

      return p;
    });

    return ok(part, { status: 201 });
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
    const { partId } = await req.json();

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    const part = await prisma.ticketPart.findFirst({ where: { id: partId, ticketId: id } });
    if (!part) return ok({ error: "القطعة غير موجودة" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.ticketPart.delete({ where: { id: partId } });
      if (part.productId) {
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
            note: `إلغاء قطعة من تذكرة`,
            reference: id,
          },
        });
      }
    });

    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
