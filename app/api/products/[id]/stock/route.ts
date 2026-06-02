import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { decrementStockOrFail } from "@/lib/stock";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";

const schema = z.object({
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  qty: z.coerce.number().int().min(1, "الكمية يجب أن تكون أكبر من صفر"),
  note: z.string().optional(),
});

export const POST = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { type, qty, note } = await parseBody(req, schema);

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!product) throw new ApiError("المنتج غير موجود", 404);

    if (type === "OUT") {
      await decrementStockOrFail(tx, id, qty);
    } else if (type === "IN") {
      await tx.product.update({ where: { id }, data: { stockQty: { increment: qty } } });
    } else {
      await tx.product.update({ where: { id }, data: { stockQty: qty } });
    }

    const updated = await tx.product.findUnique({ where: { id }, select: { stockQty: true } });
    const movement = await tx.stockMovement.create({
      data: {
        ownerId: ctx.dbUser.id,
        productId: id,
        type,
        qty,
        note: note ?? null,
        createdById: ctx.dbUser.id,
      },
    });
    return { movement, newStockQty: updated?.stockQty ?? 0 };
  });

  return ok(result, { status: 201 });
});
