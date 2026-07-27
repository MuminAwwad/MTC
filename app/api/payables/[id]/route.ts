import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";
import { softDeletePayable } from "@/lib/services/payables";

const payableInclude = {
  supplier: true,
  payments: { orderBy: { paidAt: "asc" } },
} as const;

export const GET = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const payable = await prisma.payable.findFirst({
    where: { id, ownerId: ctx.ownerId, isDeleted: false },
    include: payableInclude,
  });
  if (!payable) throw new ApiError("المستحق غير موجود", 404);
  return ok(payable);
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.$transaction((tx) => softDeletePayable(tx, ctx.ownerId, id));
  if (result === "not_found") throw new ApiError("المستحق غير موجود", 404);
  return ok({ success: true });
});

const patchSchema = z.object({
  notes: z.string().nullish(),
  reason: z.string().nullish(),
  dueDate: z.string().nullish(),
  amount: z.coerce.number().nullish(),
  currency: z.string().nullish(),
});

export const PATCH = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const { notes, dueDate, reason, amount, currency } = await parseBody(req, patchSchema);

  const existing = await prisma.payable.findFirst({
    where: { id, ownerId: ctx.ownerId, isDeleted: false },
    include: { payments: { select: { amount: true } } },
  });
  if (!existing) throw new ApiError("المستحق غير موجود", 404);

  const data: Record<string, unknown> = {};

  if (notes !== undefined) data.notes = notes || null;
  if (reason !== undefined) data.reason = reason || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  if (currency !== undefined && currency !== null) data.currency = currency;

  if (amount !== undefined && amount !== null) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new ApiError("المبلغ يجب أن يكون أكبر من صفر", 400);
    }
    const totalPaid = existing.payments.reduce((s, p) => s + Number(p.amount), 0);
    if (amt < totalPaid) {
      throw new ApiError(
        `المبلغ الجديد (${amt.toFixed(2)}) أقل من المسدّد (${totalPaid.toFixed(2)}).`,
        400
      );
    }
    data.amount = amt;
    // Recompute status against existing payments.
    data.status = totalPaid >= amt ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError("لا توجد حقول للتعديل", 400);
  }

  await prisma.payable.update({ where: { id }, data });

  const payable = await prisma.payable.findUnique({ where: { id }, include: payableInclude });
  return ok(payable);
});
