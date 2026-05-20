import { NextRequest } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";

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
      return ok(
        { error: "بيانات غير صالحة", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { type, qty, note } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, isDeleted: false },
        select: { id: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      if (type === "OUT") {
        await decrementStockOrFail(tx, id, qty);
      } else if (type === "IN") {
        await tx.product.update({
          where: { id },
          data: { stockQty: { increment: qty } },
        });
      } else {
        // ADJUSTMENT: absolute set
        await tx.product.update({ where: { id }, data: { stockQty: qty } });
      }

      const updated = await tx.product.findUnique({ where: { id }, select: { stockQty: true } });
      const movement = await tx.stockMovement.create({
        data: { productId: id, type, qty, note: note ?? null },
      });
      return { movement, newStockQty: updated?.stockQty ?? 0 };
    });

    return ok(result, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return ok({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return ok({ error: "المنتج غير موجود" }, { status: 404 });
    }
    console.error("POST /api/products/[id]/stock", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
