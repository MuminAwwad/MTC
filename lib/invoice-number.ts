import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function generateInvoiceNumber(tx: TxClient): Promise<string> {
  const year = new Date().getFullYear().toString();
  const counterId = `invoice-${year}`;
  const counter = await tx.counter.upsert({
    where: { id: counterId },
    update: { value: { increment: 1 } },
    create: { id: counterId, value: 1 },
  });
  return `MTC-${year}-${counter.value.toString().padStart(4, "0")}`;
}

export async function generateTicketNumber(tx: TxClient): Promise<string> {
  const year = new Date().getFullYear().toString();
  const counterId = `ticket-${year}`;
  const counter = await tx.counter.upsert({
    where: { id: counterId },
    update: { value: { increment: 1 } },
    create: { id: counterId, value: 1 },
  });
  return `TKT-${year}-${counter.value.toString().padStart(4, "0")}`;
}
