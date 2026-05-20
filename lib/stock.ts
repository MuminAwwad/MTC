import type { Prisma } from "@prisma/client";

export class InsufficientStockError extends Error {
  productName: string;
  available: number;
  requested: number;
  constructor(productName: string, available: number, requested: number) {
    super(`الكمية غير كافية للمنتج "${productName}" (المتوفر: ${available}, المطلوب: ${requested})`);
    this.name = "InsufficientStockError";
    this.productName = productName;
    this.available = available;
    this.requested = requested;
  }
}

/**
 * Atomically decrement product stock if at least `qty` is available.
 * If two transactions race for the last units, only one will succeed —
 * the loser sees count === 0 and we throw InsufficientStockError to
 * roll back the enclosing transaction.
 */
export async function decrementStockOrFail(
  tx: Prisma.TransactionClient,
  productId: string,
  qty: number
): Promise<void> {
  if (qty <= 0) return;
  const result = await tx.product.updateMany({
    where: { id: productId, isDeleted: false, stockQty: { gte: qty } },
    data: { stockQty: { decrement: qty } },
  });
  if (result.count === 0) {
    const current = await tx.product.findUnique({
      where: { id: productId },
      select: { name: true, stockQty: true },
    });
    throw new InsufficientStockError(
      current?.name ?? "غير معروف",
      current?.stockQty ?? 0,
      qty
    );
  }
}
