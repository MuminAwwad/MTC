import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  qty: z.coerce.number().int().min(1, "الكمية يجب أن تكون أكبر من صفر"),
  note: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { type, qty, note } = parsed.data;

    const product = await prisma.product.findFirst({
      where: { id, isDeleted: false },
    });

    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود" }, { status: 404 });
    }

    // Compute new stock
    let newQty: number;
    if (type === "IN") {
      newQty = product.stockQty + qty;
    } else if (type === "OUT") {
      if (product.stockQty < qty) {
        return NextResponse.json(
          { error: `الكمية المطلوبة (${qty}) أكبر من المخزون الحالي (${product.stockQty})` },
          { status: 400 }
        );
      }
      newQty = product.stockQty - qty;
    } else {
      // ADJUSTMENT: set absolute value
      newQty = qty;
    }

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          productId: id,
          type,
          qty,
          note: note ?? null,
        },
      }),
      prisma.product.update({
        where: { id },
        data: { stockQty: newQty },
      }),
    ]);

    return NextResponse.json({ movement, newStockQty: newQty }, { status: 201 });
  } catch (error) {
    console.error("POST /api/products/[id]/stock", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
