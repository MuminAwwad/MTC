import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const customerIds: string[] = [];
const debtIds: string[] = [];
const paymentIds: string[] = [];

afterEach(async () => {
  if (paymentIds.length) {
    await prisma.debtPayment.deleteMany({ where: { id: { in: paymentIds } } });
    paymentIds.length = 0;
  }
  if (debtIds.length) {
    await prisma.debt.deleteMany({ where: { id: { in: debtIds } } });
    debtIds.length = 0;
  }
  if (customerIds.length) {
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    customerIds.length = 0;
  }
});

async function createCustomer() {
  const c = await prisma.customer.create({ data: { name: `عميل-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
  customerIds.push(c.id);
  return c;
}

async function createDebt(data: { customerId: string; amount?: number; status?: "PENDING" | "PARTIAL" | "PAID" }) {
  const d = await prisma.debt.create({
    data: { customerId: data.customerId, amount: data.amount ?? 500, status: data.status ?? "PENDING" },
  });
  debtIds.push(d.id);
  return d;
}

describe("Debt CRUD", () => {
  it("creates a debt for a customer", async () => {
    const c = await createCustomer();
    const d = await createDebt({ customerId: c.id, amount: 300 });
    expect(d.id).toBeTruthy();
    expect(Number(d.amount)).toBe(300);
    expect(d.status).toBe("PENDING");
  });

  it("includes customer relation", async () => {
    const c = await createCustomer();
    const d = await createDebt({ customerId: c.id });
    const found = await prisma.debt.findUnique({
      where: { id: d.id },
      include: { customer: true },
    });
    expect(found?.customer.id).toBe(c.id);
  });

  it("soft-deletes a debt", async () => {
    const c = await createCustomer();
    const d = await createDebt({ customerId: c.id });
    await prisma.debt.update({ where: { id: d.id }, data: { isDeleted: true } });
    const active = await prisma.debt.findFirst({ where: { id: d.id, isDeleted: false } });
    expect(active).toBeNull();
  });

  it("records a debt payment", async () => {
    const c = await createCustomer();
    const d = await createDebt({ customerId: c.id, amount: 200 });
    const p = await prisma.debtPayment.create({
      data: { debtId: d.id, amount: 100, note: "دفعة أولى" },
    });
    paymentIds.push(p.id);
    expect(Number(p.amount)).toBe(100);

    const withPayments = await prisma.debt.findUnique({
      where: { id: d.id },
      include: { payments: true },
    });
    expect(withPayments?.payments).toHaveLength(1);
  });

  it("aggregates outstanding (non-PAID) debts", async () => {
    const c = await createCustomer();
    const tagAmount = 12345; // unlikely amount for fingerprinting
    const d1 = await createDebt({ customerId: c.id, amount: tagAmount });
    const d2 = await createDebt({ customerId: c.id, amount: tagAmount, status: "PAID" });

    const sum = await prisma.debt.aggregate({
      where: { id: { in: [d1.id, d2.id] }, status: { not: "PAID" } },
      _sum: { amount: true },
    });
    expect(Number(sum._sum.amount ?? 0)).toBe(tagAmount);
  });

  it("supports moving from PENDING to PARTIAL to PAID", async () => {
    const c = await createCustomer();
    const d = await createDebt({ customerId: c.id });

    await prisma.debt.update({ where: { id: d.id }, data: { status: "PARTIAL" } });
    let reloaded = await prisma.debt.findUnique({ where: { id: d.id } });
    expect(reloaded?.status).toBe("PARTIAL");

    await prisma.debt.update({ where: { id: d.id }, data: { status: "PAID" } });
    reloaded = await prisma.debt.findUnique({ where: { id: d.id } });
    expect(reloaded?.status).toBe("PAID");
  });

  it("filters by status", async () => {
    const c = await createCustomer();
    const pending = await createDebt({ customerId: c.id });
    const paid = await createDebt({ customerId: c.id, status: "PAID" });

    const onlyPending = await prisma.debt.findMany({
      where: { id: { in: [pending.id, paid.id] }, status: "PENDING" },
    });
    expect(onlyPending.map((d) => d.id)).toEqual([pending.id]);
  });
});
