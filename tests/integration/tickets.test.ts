import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";
import { generateTicketNumber } from "@/lib/invoice-number";

const ticketIds: string[] = [];
const customerIds: string[] = [];
const productIds: string[] = [];

afterEach(async () => {
  // Cascade order: timeline + parts cascade with ticket, so deleting ticket is sufficient.
  if (ticketIds.length) {
    await prisma.maintenanceTicket.deleteMany({ where: { id: { in: ticketIds } } });
    ticketIds.length = 0;
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
  const c = await prisma.customer.create({ data: { name: `عميل-tkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  customerIds.push(c.id);
  return c;
}

async function createTicket(extra: { customerId: string; problemDescription?: string; status?: "RECEIVED" | "DIAGNOSING" | "IN_REPAIR" | "WAITING_PARTS" | "READY" | "DELIVERED" | "CANCELLED"; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" }) {
  const t = await prisma.$transaction(async (tx) => {
    const ticketNumber = await generateTicketNumber(tx);
    return tx.maintenanceTicket.create({
      data: {
        ticketNumber,
        customerId: extra.customerId,
        deviceType: "MOBILE",
        problemDescription: extra.problemDescription ?? "الشاشة مكسورة",
        status: extra.status ?? "RECEIVED",
        priority: extra.priority ?? "NORMAL",
        timeline: { create: { status: extra.status ?? "RECEIVED", note: "تم الاستلام" } },
      },
    });
  });
  ticketIds.push(t.id);
  return t;
}

describe("MaintenanceTicket CRUD", () => {
  it("creates a ticket with ticketNumber + initial timeline entry", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });
    expect(t.id).toBeTruthy();
    expect(t.ticketNumber).toMatch(/^TKT-\d{4}-\d{4}$/);
    expect(t.status).toBe("RECEIVED");
    expect(t.priority).toBe("NORMAL");

    const timeline = await prisma.ticketUpdate.findMany({ where: { ticketId: t.id } });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].status).toBe("RECEIVED");
  });

  it("supports all device types", async () => {
    const customer = await createCustomer();
    const types = ["MOBILE", "LAPTOP", "DESKTOP", "TABLET", "OTHER"] as const;
    for (const dt of types) {
      const t = await prisma.$transaction(async (tx) => {
        const num = await generateTicketNumber(tx);
        return tx.maintenanceTicket.create({
          data: {
            ticketNumber: num,
            customerId: customer.id,
            deviceType: dt,
            problemDescription: "اختبار",
          },
        });
      });
      ticketIds.push(t.id);
      expect(t.deviceType).toBe(dt);
    }
  });

  it("transitions through ticket statuses with timeline updates", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });

    const flow = ["DIAGNOSING", "IN_REPAIR", "READY", "DELIVERED"] as const;
    for (const status of flow) {
      await prisma.$transaction([
        prisma.maintenanceTicket.update({ where: { id: t.id }, data: { status } }),
        prisma.ticketUpdate.create({ data: { ticketId: t.id, status, note: `انتقال إلى ${status}` } }),
      ]);
    }

    const updates = await prisma.ticketUpdate.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: "asc" },
    });
    expect(updates).toHaveLength(1 + flow.length); // initial + 4 transitions
    expect(updates[updates.length - 1].status).toBe("DELIVERED");

    const final = await prisma.maintenanceTicket.findUnique({ where: { id: t.id } });
    expect(final?.status).toBe("DELIVERED");
  });

  it("adds parts to a ticket", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });
    const part = await prisma.ticketPart.create({
      data: { ticketId: t.id, name: "شاشة", qty: 1, unitCost: 100, total: 100 },
    });
    expect(Number(part.total)).toBe(100);

    const withParts = await prisma.maintenanceTicket.findUnique({
      where: { id: t.id },
      include: { parts: true },
    });
    expect(withParts?.parts).toHaveLength(1);
  });

  it("part can link to a product", async () => {
    const customer = await createCustomer();
    const product = await prisma.product.create({
      data: { name: `قطعة-${Date.now()}`, costPrice: 50, sellPrice: 100, stockQty: 5 },
    });
    productIds.push(product.id);

    const t = await createTicket({ customerId: customer.id });
    const part = await prisma.ticketPart.create({
      data: { ticketId: t.id, productId: product.id, name: product.name, qty: 1, unitCost: 50, total: 50 },
    });
    expect(part.productId).toBe(product.id);
  });

  it("supports HIGH and URGENT priorities", async () => {
    const customer = await createCustomer();
    const high = await createTicket({ customerId: customer.id, priority: "HIGH" });
    const urgent = await createTicket({ customerId: customer.id, priority: "URGENT" });
    expect(high.priority).toBe("HIGH");
    expect(urgent.priority).toBe("URGENT");
  });

  it("soft-deletes a ticket", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });
    await prisma.maintenanceTicket.update({ where: { id: t.id }, data: { isDeleted: true } });
    const active = await prisma.maintenanceTicket.findFirst({ where: { id: t.id, isDeleted: false } });
    expect(active).toBeNull();
  });

  it("cascade-deletes timeline + parts when ticket is hard-deleted", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });
    await prisma.ticketPart.create({ data: { ticketId: t.id, name: "بطارية", qty: 1, unitCost: 30, total: 30 } });

    await prisma.maintenanceTicket.delete({ where: { id: t.id } });
    ticketIds.splice(ticketIds.indexOf(t.id), 1);

    const remainingTimeline = await prisma.ticketUpdate.findMany({ where: { ticketId: t.id } });
    const remainingParts = await prisma.ticketPart.findMany({ where: { ticketId: t.id } });
    expect(remainingTimeline).toHaveLength(0);
    expect(remainingParts).toHaveLength(0);
  });

  it("filters unbilled tickets (no linked invoice)", async () => {
    const customer = await createCustomer();
    const t = await createTicket({ customerId: customer.id });
    const unbilled = await prisma.maintenanceTicket.findMany({
      where: { id: t.id, invoice: { is: null } },
    });
    expect(unbilled).toHaveLength(1);
  });
});
