import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";

const schema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
});

export const GET = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const category = await prisma.category.findFirst({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    include: {
      _count: { select: { products: { where: { isDeleted: false } } } },
    },
  });
  if (!category) throw new ApiError("الفئة غير موجودة", 404);
  return ok(category);
});

export const PUT = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const data = await parseBody(req, schema);
  const normalizedName = data.name?.trim();

  if (normalizedName) {
    const existing = await prisma.category.findFirst({
      where: {
        ownerId: ctx.dbUser.id,
        name: { equals: normalizedName, mode: "insensitive" },
        isDeleted: false,
        NOT: { id },
      },
      select: { id: true, name: true },
    });
    if (existing) {
      return ok(
        { error: `فئة أخرى بنفس الاسم موجودة: ${existing.name}`, existingCategoryId: existing.id },
        { status: 409 }
      );
    }
  }

  const result = await prisma.category.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { ...data, name: normalizedName ?? data.name },
  });
  if (result.count === 0) throw new ApiError("الفئة غير موجودة", 404);

  const category = await prisma.category.findUnique({ where: { id } });
  return ok(category);
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.category.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { isDeleted: true },
  });
  if (result.count === 0) throw new ApiError("الفئة غير موجودة", 404);
  return ok({ success: true });
});
