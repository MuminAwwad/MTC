import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/invoice-number";

const invoiceIds: string[] = [];
const customerIds: string[] = [];
const productIds: string[] = [];

afterEach(async () => {
  if (invoiceIds.length) {
    // items cascade with invoice
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    invoiceIds.length = 0;
  }
  if (customerIds.length) {
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    customerIds.length = 0;
  }
  if (productIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    productIds.length = 0;
  }
});

async function createCustomer() {
  const c = await prisma.customer.create({ data: { name: `عميل-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  customerIds.push(c.id);
  return c;
}

async function createInvoice(opts: {
  customerId: string;
  items: { name: string; qty: number; unitPrice: number; productId?: string }[];
  status?: "DRAFT" | "ISSUED" | "PAID" | "PARTIAL" | "CANCELLED";
  paidAmount?: number;
}) {
  const subtotal = opts.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const inv = await prisma.$transaction(async (tx) => {
    const num = await generateInvoiceNumber(tx);
    return tx.invoice.create({
      data: {
        invoiceNumber: num,
        customerId: opts.customerId,
        subtotal,
        total: subtotal,
        paidAmount: opts.paidAmount ?? 0,
        remainingAmount: subtotal - (opts.paidAmount ?? 0),
        status: opts.status ?? "DRAFT",
        items: {
          create: opts.items.map((it) => ({
            productId: it.productId,
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
            total: it.qty * it.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  });
  invoiceIds.push(inv.id);
  return inv;
}

describe("Invoice creation", () => {
  it("creates an invoice with items and a unique invoiceNumber", async () => {
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      items: [{ name: "منتج 1", qty: 2, unitPrice: 50 }],
    });
    expect(inv.invoiceNumber).toMatch(/^MTC-\d{4}-\d{4}$/);
    expect(inv.items).toHaveLength(1);
    expect(Number(inv.subtotal)).toBe(100);
    expect(Number(inv.total)).toBe(100);
    expect(inv.status).toBe("DRAFT");
  });

  it("enforces invoiceNumber uniqueness", async () => {
    const customer = await createCustomer();
    const number = `MTC-TEST-DUP-${Date.now()}`;
    const a = await prisma.invoice.create({
      data: {
        invoiceNumber: number,
        customerId: customer.id,
        subtotal: 10,
        total: 10,
      },
    });
    invoiceIds.push(a.id);

    await expect(
      prisma.invoice.create({
        data: {
          invoiceNumber: number,
          customerId: customer.id,
          subtotal: 10,
          total: 10,
        },
      })
    ).rejects.toThrow();
  });

  it("supports multiple items per invoice", async () => {
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      items: [
        { name: "أ", qty: 1, unitPrice: 10 },
        { name: "ب", qty: 3, unitPrice: 20 },
      ],
    });
    expect(inv.items).toHaveLength(2);
    expect(Number(inv.subtotal)).toBe(70);
  });

  it("computes paidAmount + remainingAmount correctly", async () => {
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      items: [{ name: "منتج", qty: 1, unitPrice: 100 }],
      paidAmount: 40,
      status: "PARTIAL",
    });
    expect(Number(inv.paidAmount)).toBe(40);
    expect(Number(inv.remainingAmount)).toBe(60);
    expect(inv.status).toBe("PARTIAL");
  });

  it("can mark invoice as PAID", async () => {
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      items: [{ name: "منتج", qty: 1, unitPrice: 100 }],
      paidAmount: 100,
      status: "PAID",
    });
    expect(inv.status).toBe("PAID");
    expect(Number(inv.remainingAmount)).toBe(0);
  });

  it("cascade-deletes items when invoice is hard-deleted", async () => {
    const customer = await createCustomer();
    const inv = await createInvoice({
      customerId: customer.id,
      items: [{ name: "x", qty: 1, unitPrice: 5 }],
    });
    const itemIds = inv.items.map((i) => i.id);

    await prisma.invoice.delete({ where: { id: inv.id } });
    invoiceIds.splice(invoiceIds.indexOf(inv.id), 1);

    const remaining = await prisma.invoiceItem.findMany({ where: { id: { in: itemIds } } });
    expect(remaining).toHaveLength(0);
  });

  it("aggregates invoice totals", async () => {
    const customer = await createCustomer();
    const tag = 99999 + Math.floor(Math.random() * 1000); // unique-ish total
    const a = await createInvoice({
      customerId: customer.id,
      items: [{ name: "م1", qty: 1, unitPrice: tag }],
    });
    const b = await createInvoice({
      customerId: customer.id,
      items: [{ name: "م2", qty: 1, unitPrice: tag }],
    });

    const sum = await prisma.invoice.aggregate({
      where: { id: { in: [a.id, b.id] } },
      _sum: { total: true },
    });
    expect(Number(sum._sum.total ?? 0)).toBe(tag * 2);
  });

  it("supports different currencies on invoice", async () => {
    const customer = await createCustomer();
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `MTC-CUR-${Date.now()}`,
        customerId: customer.id,
        subtotal: 50,
        total: 50,
        currency: "USD",
        exchangeRate: 3.6,
      },
    });
    invoiceIds.push(inv.id);
    expect(inv.currency).toBe("USD");
    expect(Number(inv.exchangeRate)).toBe(3.6);
  });

  it("can link an invoice to a maintenance ticket (1:1)", async () => {
    const customer = await createCustomer();
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        ticketNumber: `TKT-LINK-${Date.now()}`,
        customerId: customer.id,
        deviceType: "MOBILE",
        problemDescription: "اختبار ربط",
      },
    });

    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `MTC-LINK-${Date.now()}`,
        customerId: customer.id,
        subtotal: 200,
        total: 200,
        ticketId: ticket.id,
      },
      include: { ticket: true },
    });
    invoiceIds.push(inv.id);

    expect(inv.ticketId).toBe(ticket.id);
    expect(inv.ticket?.id).toBe(ticket.id);

    // cleanup link
    await prisma.invoice.delete({ where: { id: inv.id } });
    invoiceIds.splice(invoiceIds.indexOf(inv.id), 1);
    await prisma.maintenanceTicket.delete({ where: { id: ticket.id } });
  });
});
