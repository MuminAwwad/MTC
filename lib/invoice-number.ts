import type { Prisma } from "@prisma/client";

/**
 * Atomically allocate the next sequential number for a per-shop counter.
 * Counters are keyed by `${ownerId}:${kind}-${year}` so two shops can each
 * have their own MTC-2026-0001 without colliding, and numbering resets yearly.
 */
async function nextSequence(
  tx: Prisma.TransactionClient,
  ownerId: string,
  kind: "invoice" | "ticket"
): Promise<number> {
  const year = new Date().getFullYear().toString();
  const counter = await tx.counter.upsert({
    where: { id: `${ownerId}:${kind}-${year}` },
    update: { value: { increment: 1 } },
    create: { id: `${ownerId}:${kind}-${year}`, value: 1 },
  });
  return counter.value;
}

const format = (prefix: string, value: number): string =>
  `${prefix}-${new Date().getFullYear()}-${value.toString().padStart(4, "0")}`;

export async function generateInvoiceNumber(tx: Prisma.TransactionClient, ownerId: string): Promise<string> {
  return format("MTC", await nextSequence(tx, ownerId, "invoice"));
}

export async function generateTicketNumber(tx: Prisma.TransactionClient, ownerId: string): Promise<string> {
  return format("TKT", await nextSequence(tx, ownerId, "ticket"));
}
