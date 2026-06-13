import type { Prisma } from "@prisma/client";
import { returnStockToInventory } from "@/lib/stock";

/**
 * Soft-delete a maintenance ticket within the caller's transaction, returning
 * any parts that were drawn from stock back to inventory. The linked invoice
 * (if any) is left in place — it stands on its own and can be deleted
 * separately. Shared by the REST DELETE route and the assistant's delete
 * action. Returns false if no matching ticket exists (caller maps to 404).
 */
export async function softDeleteTicket(
  tx: Prisma.TransactionClient,
  ownerId: string,
  userId: string,
  id: string
): Promise<boolean> {
  const ticket = await tx.maintenanceTicket.findFirst({
    where: { id, ownerId, isDeleted: false },
    include: { parts: true },
  });
  if (!ticket) return false;

  for (const part of ticket.parts) {
    if (part.productId && part.qty > 0) {
      await returnStockToInventory(tx, {
        ownerId,
        userId,
        productId: part.productId,
        qty: part.qty,
        note: `حذف تذكرة ${ticket.ticketNumber}`,
        reference: ticket.ticketNumber,
      });
    }
  }

  await tx.maintenanceTicket.update({ where: { id }, data: { isDeleted: true } });
  return true;
}
