import { describe, it, expect, afterAll } from "vitest";
import prisma from "@/lib/prisma";
import { generateInvoiceNumber, generateTicketNumber } from "@/lib/invoice-number";

const year = new Date().getFullYear().toString();

afterAll(async () => {
  await prisma.counter.deleteMany({
    where: { id: { in: [`invoice-${year}-test`, `ticket-${year}-test`] } },
  });
});

describe("generateInvoiceNumber", () => {
  it("returns a correctly formatted invoice number", async () => {
    const num = await generateInvoiceNumber(prisma);
    expect(num).toMatch(/^MTC-\d{4}-\d{4}$/);
  });

  it("includes the current year", async () => {
    const num = await generateInvoiceNumber(prisma);
    expect(num).toContain(`MTC-${year}-`);
  });

  it("increments on each call", async () => {
    const a = await generateInvoiceNumber(prisma);
    const b = await generateInvoiceNumber(prisma);
    const numA = parseInt(a.split("-")[2]);
    const numB = parseInt(b.split("-")[2]);
    expect(numB).toBe(numA + 1);
  });
});

describe("generateTicketNumber", () => {
  it("returns a correctly formatted ticket number", async () => {
    const num = await generateTicketNumber(prisma);
    expect(num).toMatch(/^TKT-\d{4}-\d{4}$/);
  });

  it("includes the current year", async () => {
    const num = await generateTicketNumber(prisma);
    expect(num).toContain(`TKT-${year}-`);
  });

  it("invoice and ticket counters are independent", async () => {
    const invoice = await generateInvoiceNumber(prisma);
    const ticket = await generateTicketNumber(prisma);
    expect(invoice.startsWith("MTC-")).toBe(true);
    expect(ticket.startsWith("TKT-")).toBe(true);
  });
});
