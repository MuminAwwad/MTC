import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";
import { softDeleteDebt } from "@/lib/services/debts";

const debtInclude = {
  customer: true,
  invoice: { select: { id: true, invoiceNumber: true } },
  payments: { orderBy: { paidAt: "asc" } },
} as const;

export const GET = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const debt = await prisma.debt.findFirst({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    include: debtInclude,
  });
  if (!debt) throw new ApiError("الدين غير موجود", 404);
  return ok(debt);
});

/**
 * Delete a debt. Only manual (standalone) debts can be deleted here: an
 * invoice-backed debt mirrors the invoice's denormalized money totals, so
 * removing it on its own would desync the invoice — delete/cancel the invoice
 * instead, which voids its linked debt as a side-effect. Recorded payments
 * stay attached to the (now soft-deleted) debt as a historical record.
 */
export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.$transaction((tx) => softDeleteDebt(tx, ctx.dbUser.id, id));
  if (result === "not_found") throw new ApiError("الدين غير موجود", 404);
  if (result === "linked") {
    throw new ApiError("هذا الدين مرتبط بفاتورة. احذف الفاتورة بدلًا من ذلك.", 400);
  }
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

  const existing = await prisma.debt.findFirst({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    include: { payments: { select: { amount: true } } },
  });
  if (!existing) throw new ApiError("الدين غير موجود", 404);

  // Money fields are denormalized onto the linked invoice — editing the
  // amount/currency of an invoice-backed debt would desync the invoice, so
  // those stay read-only here (edit the invoice instead). reason/dueDate/
  // notes are always editable.
  const isLinked = !!existing.invoiceId;
  const data: Record<string, unknown> = {};

  if (notes !== undefined) data.notes = notes || null;
  if (reason !== undefined) data.reason = reason || null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  if ((amount !== undefined && amount !== null) || (currency !== undefined && currency !== null)) {
    if (isLinked) {
      throw new ApiError(
        "لا يمكن تعديل مبلغ أو عملة دين مرتبط بفاتورة. عدّل الفاتورة بدلًا من ذلك.",
        400
      );
    }
  }

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

  await prisma.debt.update({ where: { id }, data });

  const debt = await prisma.debt.findUnique({ where: { id }, include: debtInclude });
  return ok(debt);
});
