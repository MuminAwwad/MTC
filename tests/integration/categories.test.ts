import { describe, it, expect, afterEach } from "vitest";
import prisma from "@/lib/prisma";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await prisma.category.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

async function createCategory(data: { name?: string; slug?: string; icon?: string | null } = {}) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const c = await prisma.category.create({
    data: {
      name: data.name ?? `فئة-${unique}`,
      slug: data.slug ?? `slug-${unique}`,
      icon: data.icon,
    },
  });
  createdIds.push(c.id);
  return c;
}

describe("Category CRUD", () => {
  it("creates a category", async () => {
    const c = await createCategory({ name: "إكسسوارات هاتف" });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe("إكسسوارات هاتف");
    expect(c.isDeleted).toBe(false);
  });

  it("enforces name uniqueness", async () => {
    const name = `فئة-فريدة-${Date.now()}`;
    await createCategory({ name });
    await expect(createCategory({ name })).rejects.toThrow();
  });

  it("enforces slug uniqueness", async () => {
    const slug = `slug-fixed-${Date.now()}`;
    await createCategory({ slug });
    await expect(createCategory({ slug })).rejects.toThrow();
  });

  it("soft-deletes a category", async () => {
    const c = await createCategory();
    await prisma.category.update({ where: { id: c.id }, data: { isDeleted: true } });
    const active = await prisma.category.findFirst({ where: { id: c.id, isDeleted: false } });
    expect(active).toBeNull();
  });

  it("updates icon", async () => {
    const c = await createCategory({ icon: "old" });
    const updated = await prisma.category.update({
      where: { id: c.id },
      data: { icon: "new" },
    });
    expect(updated.icon).toBe("new");
  });
});
