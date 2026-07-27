import type { Prisma } from "@prisma/client";

export type DeletePayableResult = "deleted" | "not_found";

/**
 * Soft-delete a payable within the caller's transaction. Unlike Debt, Payable
 * has no linked-record field (no invoice equivalent), so there's no "linked"
 * case to protect against — every payable is a standalone record.
 */
export async function softDeletePayable(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: string
): Promise<DeletePayableResult> {
  const payable = await tx.payable.findFirst({
    where: { id, ownerId, isDeleted: false },
    select: { id: true },
  });
  if (!payable) return "not_found";
  await tx.payable.update({ where: { id }, data: { isDeleted: true } });
  return "deleted";
}
