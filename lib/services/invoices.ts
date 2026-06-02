import type { Prisma } from "@prisma/client";
import { returnStockToInventory } from "@/lib/stock";

/**
 * Soft-delete an invoice and reverse its side-effects, within the caller's
 * transaction. Shared by the REST DELETE route and the assistant's delete
 * action so both behave identically.
 *
 * - DRAFT / CANCELLED: plain soft-delete (no stock or live debt to reverse —
 *   a cancel already returned stock and voided debts).
 * - ISSUED / PARTIAL / PAID: return every productized line to stock and
 *   soft-delete the linked debts. Recorded payments stay on the (now
 *   soft-deleted) debts as a historical record.
 *
 * Returns false if no matching invoice exists (caller maps that to a 404).
 */
export async function softDeleteInvoice(
  tx: Prisma.TransactionClient,
  ownerId: string,
  userId: string,
  id: string
): Promise<boolean> {
  const invoice = await tx.invoice.findFirst({
    where: { id, ownerId, isDeleted: false },
    include: { items: true },
  });
  if (!invoice) return false;

  const needsStockReversal =
    invoice.status === "ISSUED" ||
    invoice.status === "PARTIAL" ||
    invoice.status === "PAID";

  if (needsStockReversal) {
    for (const item of invoice.items) {
      if (item.productId && item.qty > 0) {
        await returnStockToInventory(tx, {
          ownerId,
          userId,
          productId: item.productId,
          qty: item.qty,
          note: `حذف فاتورة ${invoice.invoiceNumber}`,
          reference: invoice.invoiceNumber,
        });
      }
    }
    await tx.debt.updateMany({
      where: { invoiceId: id, isDeleted: false },
      data: { isDeleted: true },
    });
  }

  await tx.invoice.update({ where: { id }, data: { isDeleted: true } });
  return true;
}
