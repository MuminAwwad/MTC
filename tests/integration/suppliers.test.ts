import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await prisma.supplier.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

async function createSupplier(data: { name?: string; phone?: string | null; company?: string | null; notes?: string | null } = {}) {
  const s = await prisma.supplier.create({
    data: { name: data.name ?? `مورد-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data },
  });
  createdIds.push(s.id);
  return s;
}

describe("Supplier CRUD", () => {
  it("creates with name only", async () => {
    const s = await createSupplier({ name: "مورد القطع" });
    expect(s.id).toBeTruthy();
    expect(s.name).toBe("مورد القطع");
    expect(s.phone).toBeNull();
    expect(s.isDeleted).toBe(false);
  });

  it("creates with full info", async () => {
    const phone = `059${Date.now()}`.slice(0, 10);
    const s = await createSupplier({ name: "ABC Electronics", phone, company: "ABC", notes: "ملاحظات" });
    expect(s.phone).toBe(phone);
    expect(s.company).toBe("ABC");
    expect(s.notes).toBe("ملاحظات");
  });

  it("enforces phone uniqueness", async () => {
    const phone = `059${Date.now()}u`.slice(0, 10);
    await createSupplier({ phone });
    await expect(createSupplier({ phone })).rejects.toThrow();
  });

  it("updates supplier company", async () => {
    const s = await createSupplier({ company: "قديم" });
    const updated = await prisma.supplier.update({
      where: { id: s.id },
      data: { company: "جديد" },
    });
    expect(updated.company).toBe("جديد");
  });

  it("soft-deletes supplier", async () => {
    const s = await createSupplier();
    await prisma.supplier.update({ where: { id: s.id }, data: { isDeleted: true } });
    const active = await prisma.supplier.findFirst({ where: { id: s.id, isDeleted: false } });
    expect(active).toBeNull();
  });

  it("lists only non-deleted", async () => {
    const a = await createSupplier();
    const b = await createSupplier();
    await prisma.supplier.update({ where: { id: b.id }, data: { isDeleted: true } });
    const found = await prisma.supplier.findMany({
      where: { id: { in: [a.id, b.id] }, isDeleted: false },
    });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(a.id);
  });
});
