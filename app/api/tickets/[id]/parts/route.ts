import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parts = await prisma.ticketPart.findMany({
      where: { ticketId: id },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(parts);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { productId, name, qty, unitCost } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: "اسم القطعة مطلوب" }, { status: 400 });
    if (!qty || qty < 1) return NextResponse.json({ error: "الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });
    if (unitCost === undefined || unitCost < 0) return NextResponse.json({ error: "السعر غير صالح" }, { status: 400 });

    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, isDeleted: false } });
    if (!ticket) return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });

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
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (product) {
          await tx.product.update({
            where: { id: productId },
            data: { stockQty: Math.max(0, product.stockQty - qty) },
          });
          await tx.stockMovement.create({
            data: {
              productId,
              type: "OUT",
              qty,
              note: `قطعة لتذكرة ${ticket.ticketNumber}`,
              reference: ticket.ticketNumber,
            },
          });
        }
      }

      return p;
    });

    return NextResponse.json(part, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { partId } = await req.json();
    const part = await prisma.ticketPart.findFirst({ where: { id: partId, ticketId: id } });
    if (!part) return NextResponse.json({ error: "القطعة غير موجودة" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.ticketPart.delete({ where: { id: partId } });
      if (part.productId) {
        await tx.product.update({
          where: { id: part.productId },
          data: { stockQty: { increment: part.qty } },
        });
        await tx.stockMovement.create({
          data: {
            productId: part.productId,
            type: "IN",
            qty: part.qty,
            note: `إلغاء قطعة من تذكرة`,
            reference: id,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
