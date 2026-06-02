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

export interface StockMovementInput {
  ownerId: string;
  userId: string;
  productId: string;
  qty: number;
  note: string;
  reference?: string | null;
}

/**
 * Return `qty` units to a product's on-hand stock and log an IN movement.
 * Used wherever a stock-affecting document is reversed (invoice cancel/edit/
 * delete, ticket part removal/delete). No-op for non-positive quantities.
 */
export async function returnStockToInventory(
  tx: Prisma.TransactionClient,
  { ownerId, userId, productId, qty, note, reference = null }: StockMovementInput
): Promise<void> {
  if (qty <= 0) return;
  await tx.product.update({
    where: { id: productId },
    data: { stockQty: { increment: qty } },
  });
  await tx.stockMovement.create({
    data: { ownerId, productId, createdById: userId, type: "IN", qty, note, reference },
  });
}

/**
 * Draw `qty` units from a product's on-hand stock (failing if insufficient)
 * and log an OUT movement. The atomic counterpart to returnStockToInventory.
 */
export async function issueStockFromInventory(
  tx: Prisma.TransactionClient,
  { ownerId, userId, productId, qty, note, reference = null }: StockMovementInput
): Promise<void> {
  if (qty <= 0) return;
  await decrementStockOrFail(tx, productId, qty);
  await tx.stockMovement.create({
    data: { ownerId, productId, createdById: userId, type: "OUT", qty, note, reference },
  });
}
