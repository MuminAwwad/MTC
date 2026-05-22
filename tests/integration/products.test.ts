import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const createdProductIds: string[] = [];
const createdMovementIds: string[] = [];

afterEach(async () => {
  if (createdMovementIds.length) {
    await prisma.stockMovement.deleteMany({ where: { id: { in: createdMovementIds } } });
    createdMovementIds.length = 0;
  }
  if (createdProductIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    createdProductIds.length = 0;
  }
});

async function createProduct(
  data: Partial<Parameters<typeof prisma.product.create>[0]["data"]> & { name?: string } = {}
) {
  const product = await prisma.product.create({
    data: {
      name: data.name ?? `tst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      costPrice: data.costPrice ?? 10,
      sellPrice: data.sellPrice ?? 20,
      stockQty: data.stockQty ?? 0,
      minStockQty: data.minStockQty ?? 0,
      ...data,
    } as Parameters<typeof prisma.product.create>[0]["data"],
  });
  createdProductIds.push(product.id);
  return product;
}

describe("Product CRUD", () => {
  it("creates a product with required fields", async () => {
    const p = await createProduct({ name: "شاحن آيفون" });
    expect(p.id).toBeTruthy();
    expect(p.name).toBe("شاحن آيفون");
    expect(p.isActive).toBe(true);
    expect(p.isDeleted).toBe(false);
    expect(p.unit).toBe("PIECE");
    expect(Number(p.costPrice)).toBe(10);
    expect(Number(p.sellPrice)).toBe(20);
  });

  it("creates with SKU and barcode", async () => {
    const sku = `SKU-${Date.now()}`;
    const barcode = `BC-${Date.now()}`;
    const p = await createProduct({ sku, barcode });
    expect(p.sku).toBe(sku);
    expect(p.barcode).toBe(barcode);
  });

  it("enforces SKU uniqueness", async () => {
    const sku = `unique-sku-${Date.now()}`;
    await createProduct({ sku });
    await expect(createProduct({ sku })).rejects.toThrow();
  });

  it("enforces barcode uniqueness", async () => {
    const barcode = `unique-bc-${Date.now()}`;
    await createProduct({ barcode });
    await expect(createProduct({ barcode })).rejects.toThrow();
  });

  it("updates product price", async () => {
    const p = await createProduct({ sellPrice: 30 });
    const updated = await prisma.product.update({
      where: { id: p.id },
      data: { sellPrice: 50 },
    });
    expect(Number(updated.sellPrice)).toBe(50);
  });

  it("soft-deletes a product", async () => {
    const p = await createProduct();
    await prisma.product.update({ where: { id: p.id }, data: { isDeleted: true } });
    const active = await prisma.product.findFirst({
      where: { id: p.id, isDeleted: false },
    });
    expect(active).toBeNull();
  });

  it("lists only non-deleted products", async () => {
    const active = await createProduct({ name: "نشط-" + Date.now() });
    const deleted = await createProduct({ name: "محذوف-" + Date.now() });
    await prisma.product.update({ where: { id: deleted.id }, data: { isDeleted: true } });

    const result = await prisma.product.findMany({
      where: { id: { in: [active.id, deleted.id] }, isDeleted: false },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
  });

  it("flags low stock when stockQty <= minStockQty", async () => {
    const p = await createProduct({ stockQty: 3, minStockQty: 5 });
    const reloaded = await prisma.product.findUnique({ where: { id: p.id } });
    expect(reloaded!.stockQty).toBeLessThanOrEqual(reloaded!.minStockQty);
  });

  it("supports different stock units", async () => {
    const p = await createProduct({ unit: "BOX" });
    expect(p.unit).toBe("BOX");
  });

  it("can mark product inactive without deletion", async () => {
    const p = await createProduct();
    const updated = await prisma.product.update({
      where: { id: p.id },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
    expect(updated.isDeleted).toBe(false);
  });

  it("records a stock movement linked to the product", async () => {
    const p = await createProduct({ stockQty: 10 });
    const mv = await prisma.stockMovement.create({
      data: { productId: p.id, type: "IN", qty: 5, note: "رصيد اختبار" },
    });
    createdMovementIds.push(mv.id);

    const found = await prisma.stockMovement.findUnique({ where: { id: mv.id } });
    expect(found?.qty).toBe(5);
    expect(found?.type).toBe("IN");
  });
});
