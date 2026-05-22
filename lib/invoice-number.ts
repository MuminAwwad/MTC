import { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Counters are per-shop: the ownerId is embedded in the counter row's id so
// two users can each have their own MTC-2026-0001 without colliding.
export async function generateInvoiceNumber(tx: TxClient, ownerId: string): Promise<string> {
  const year = new Date().getFullYear().toString();
  const counterId = `${ownerId}:invoice-${year}`;
  const counter = await tx.counter.upsert({
    where: { id: counterId },
    update: { value: { increment: 1 } },
    create: { id: counterId, value: 1 },
  });
  return `MTC-${year}-${counter.value.toString().padStart(4, "0")}`;
}

export async function generateTicketNumber(tx: TxClient, ownerId: string): Promise<string> {
  const year = new Date().getFullYear().toString();
  const counterId = `${ownerId}:ticket-${year}`;
  const counter = await tx.counter.upsert({
    where: { id: counterId },
    update: { value: { increment: 1 } },
    create: { id: counterId, value: 1 },
  });
  return `TKT-${year}-${counter.value.toString().padStart(4, "0")}`;
}
