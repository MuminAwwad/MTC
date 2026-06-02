import type { Prisma } from "@prisma/client";

export type DeleteDebtResult = "deleted" | "not_found" | "linked";

/**
 * Soft-delete a debt within the caller's transaction. Only manual (standalone)
 * debts can be deleted: an invoice-backed debt mirrors the invoice's
 * denormalized money totals, so removing it on its own would desync the
 * invoice — those must be deleted via their invoice instead. Recorded payments
 * stay attached to the (now soft-deleted) debt as a historical record.
 *
 * Returns "not_found" if no matching debt exists, "linked" if it's backed by
 * an invoice (caller maps to a 400), or "deleted" on success.
 */
export async function softDeleteDebt(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: string
): Promise<DeleteDebtResult> {
  const debt = await tx.debt.findFirst({
    where: { id, ownerId, isDeleted: false },
    select: { id: true, invoiceId: true },
  });
  if (!debt) return "not_found";
  if (debt.invoiceId) return "linked";
  await tx.debt.update({ where: { id }, data: { isDeleted: true } });
  return "deleted";
}
