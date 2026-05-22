import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const expenseIds: string[] = [];
const categoryIds: string[] = [];

afterEach(async () => {
  if (expenseIds.length) {
    await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
    expenseIds.length = 0;
  }
  if (categoryIds.length) {
    await prisma.expenseCategory.deleteMany({ where: { id: { in: categoryIds } } });
    categoryIds.length = 0;
  }
});

async function createCategory(name?: string) {
  const c = await prisma.expenseCategory.create({
    data: { name: name ?? `فئة-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
  });
  categoryIds.push(c.id);
  return c;
}

async function createExpense(data: { amount?: number; categoryId?: string | null; description?: string | null; date?: Date } = {}) {
  const e = await prisma.expense.create({
    data: {
      amount: data.amount ?? 100,
      categoryId: data.categoryId ?? null,
      description: data.description ?? null,
      date: data.date ?? new Date(),
    },
  });
  expenseIds.push(e.id);
  return e;
}

describe("ExpenseCategory", () => {
  it("creates a category", async () => {
    const c = await createCategory("كهرباء");
    expect(c.id).toBeTruthy();
    expect(c.name).toBe("كهرباء");
  });

  it("enforces unique category name", async () => {
    const name = `فئة-فريدة-${Date.now()}`;
    await createCategory(name);
    await expect(createCategory(name)).rejects.toThrow();
  });
});

describe("Expense CRUD", () => {
  it("creates an expense", async () => {
    const e = await createExpense({ amount: 250, description: "فاتورة كهرباء" });
    expect(e.id).toBeTruthy();
    expect(Number(e.amount)).toBe(250);
    expect(e.description).toBe("فاتورة كهرباء");
    expect(e.isDeleted).toBe(false);
  });

  it("links to a category", async () => {
    const cat = await createCategory();
    const e = await createExpense({ categoryId: cat.id });

    const fetched = await prisma.expense.findUnique({
      where: { id: e.id },
      include: { category: true },
    });
    expect(fetched?.category?.id).toBe(cat.id);
  });

  it("soft-deletes an expense", async () => {
    const e = await createExpense();
    await prisma.expense.update({ where: { id: e.id }, data: { isDeleted: true } });
    const active = await prisma.expense.findFirst({ where: { id: e.id, isDeleted: false } });
    expect(active).toBeNull();
  });

  it("supports different currencies", async () => {
    const e = await prisma.expense.create({
      data: { amount: 50, currency: "USD" },
    });
    expenseIds.push(e.id);
    expect(e.currency).toBe("USD");
  });

  it("filters expenses by date range", async () => {
    const old = await createExpense({ date: new Date("2020-01-01"), description: "قديمة-" + Date.now() });
    const recent = await createExpense({ date: new Date(), description: "حديثة-" + Date.now() });

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);

    const filtered = await prisma.expense.findMany({
      where: {
        id: { in: [old.id, recent.id] },
        date: { gte: fromDate },
      },
    });
    expect(filtered.map((e) => e.id)).toContain(recent.id);
    expect(filtered.map((e) => e.id)).not.toContain(old.id);
  });

  it("aggregates total expense amount", async () => {
    const tag = `agg-${Date.now()}`;
    await createExpense({ amount: 100, description: tag });
    await createExpense({ amount: 50, description: tag });

    const sum = await prisma.expense.aggregate({
      where: { description: tag },
      _sum: { amount: true },
    });
    expect(Number(sum._sum.amount ?? 0)).toBe(150);
  });
});
