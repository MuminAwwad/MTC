import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Currency } from "@prisma/client";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";

const patchSchema = z.object({
  categoryId: z.string().nullish(),
  amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر").optional(),
  currency: z.enum(Currency).optional(),
  description: z.string().nullish(),
  date: z.string().nullish(),
});

export const PATCH = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { categoryId, amount, currency, description, date } = await parseBody(req, patchSchema);

  const expense = await prisma.expense.findFirst({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    select: { id: true },
  });
  if (!expense) throw new ApiError("المصروف غير موجود", 404);

  if (categoryId) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: categoryId, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!category) throw new ApiError("الفئة غير موجودة", 404);
  }

  const data: Record<string, unknown> = {};
  if (categoryId !== undefined) data.categoryId = categoryId || null;
  if (amount !== undefined) data.amount = amount;
  if (currency !== undefined) data.currency = currency as Currency;
  if (description !== undefined) data.description = description || null;
  if (date !== undefined) data.date = date ? new Date(date) : new Date();

  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: { category: true },
  });
  return ok(updated);
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.expense.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { isDeleted: true },
  });
  if (result.count === 0) throw new ApiError("المصروف غير موجود", 404);
  return ok({ success: true });
});
