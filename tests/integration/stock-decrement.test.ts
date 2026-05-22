import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";

const productIds: string[] = [];

afterEach(async () => {
  if (productIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    productIds.length = 0;
  }
});

async function createProduct(stockQty: number, name?: string) {
  const p = await prisma.product.create({
    data: {
      name: name ?? `stock-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      costPrice: 5,
      sellPrice: 10,
      stockQty,
    },
  });
  productIds.push(p.id);
  return p;
}

describe("decrementStockOrFail", () => {
  it("no-ops on qty <= 0", async () => {
    const p = await createProduct(10);
    await prisma.$transaction(async (tx) => {
      await decrementStockOrFail(tx, p.id, 0);
      await decrementStockOrFail(tx, p.id, -3);
    });
    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.stockQty).toBe(10);
  });

  it("decrements stock when sufficient", async () => {
    const p = await createProduct(10);
    await prisma.$transaction(async (tx) => {
      await decrementStockOrFail(tx, p.id, 3);
    });
    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.stockQty).toBe(7);
  });

  it("throws InsufficientStockError when not enough stock", async () => {
    const p = await createProduct(2, "عنصر-ناقص");
    await expect(
      prisma.$transaction(async (tx) => {
        await decrementStockOrFail(tx, p.id, 5);
      })
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.stockQty).toBe(2);
  });

  it("error contains productName, available, requested", async () => {
    const p = await createProduct(1, "اختبار-المخزون");
    try {
      await prisma.$transaction(async (tx) => {
        await decrementStockOrFail(tx, p.id, 4);
      });
      expect.fail("Expected InsufficientStockError");
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientStockError);
      const err = e as InsufficientStockError;
      expect(err.productName).toBe("اختبار-المخزون");
      expect(err.available).toBe(1);
      expect(err.requested).toBe(4);
    }
  });

  it("ignores soft-deleted products (treats as zero stock)", async () => {
    const p = await createProduct(10);
    await prisma.product.update({ where: { id: p.id }, data: { isDeleted: true } });

    await expect(
      prisma.$transaction(async (tx) => {
        await decrementStockOrFail(tx, p.id, 1);
      })
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("can drain stock to exactly zero", async () => {
    const p = await createProduct(5);
    await prisma.$transaction(async (tx) => {
      await decrementStockOrFail(tx, p.id, 5);
    });
    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.stockQty).toBe(0);
  });
});
