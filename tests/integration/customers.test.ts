import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await prisma.customer.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

async function createCustomer(data: { name: string; phone?: string; address?: string }) {
  const c = await prisma.customer.create({ data });
  createdIds.push(c.id);
  return c;
}

describe("Customer CRUD", () => {
  it("creates a customer with required fields only", async () => {
    const c = await createCustomer({ name: "أحمد محمد" });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe("أحمد محمد");
    expect(c.phone).toBeNull();
    expect(c.isDeleted).toBe(false);
  });

  it("creates a customer with all fields", async () => {
    const c = await createCustomer({
      name: "محمد علي",
      phone: "0599123456",
      address: "نابلس، فلسطين",
    });
    expect(c.phone).toBe("0599123456");
    expect(c.address).toBe("نابلس، فلسطين");
  });

  it("fetches a customer by id", async () => {
    const created = await createCustomer({ name: "فاطمة حسن" });
    const found = await prisma.customer.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("فاطمة حسن");
  });

  it("soft-deletes a customer", async () => {
    const c = await createCustomer({ name: "يوسف عمر" });
    await prisma.customer.update({ where: { id: c.id }, data: { isDeleted: true } });
    const found = await prisma.customer.findFirst({
      where: { id: c.id, isDeleted: false },
    });
    expect(found).toBeNull();
  });

  it("updates customer name", async () => {
    const c = await createCustomer({ name: "الاسم القديم" });
    const updated = await prisma.customer.update({
      where: { id: c.id },
      data: { name: "الاسم الجديد" },
    });
    expect(updated.name).toBe("الاسم الجديد");
  });

  it("lists only non-deleted customers", async () => {
    const c1 = await createCustomer({ name: "عميل نشط" });
    const c2 = await createCustomer({ name: "عميل محذوف" });
    await prisma.customer.update({ where: { id: c2.id }, data: { isDeleted: true } });

    const active = await prisma.customer.findMany({
      where: { id: { in: [c1.id, c2.id] }, isDeleted: false },
    });
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("عميل نشط");
  });
});
