import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    include: {
      products: { where: { isDeleted: false }, orderBy: { name: "asc" } },
      payables: {
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { payments: true },
      },
      _count: {
        select: {
          products: { where: { isDeleted: false } },
          payables: { where: { isDeleted: false } },
        },
      },
    },
  });
  if (!supplier) throw new ApiError("المورد غير موجود", 404);
  return ok(supplier);
});

export const PUT = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const data = await parseBody(req, schema);
  const normalizedPhone = data.phone?.trim() || null;

  if (normalizedPhone) {
    const existing = await prisma.supplier.findFirst({
      where: { ownerId: ctx.dbUser.id, phone: normalizedPhone, isDeleted: false, NOT: { id } },
      select: { id: true, name: true },
    });
    if (existing) {
      return ok(
        { error: `مورد آخر بنفس رقم الهاتف موجود: ${existing.name}`, existingSupplierId: existing.id },
        { status: 409 }
      );
    }
  }

  const result = await prisma.supplier.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { ...data, phone: normalizedPhone },
  });
  if (result.count === 0) throw new ApiError("المورد غير موجود", 404);

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  return ok(supplier);
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.supplier.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { isDeleted: true },
  });
  if (result.count === 0) throw new ApiError("المورد غير موجود", 404);
  return ok({ success: true });
});
