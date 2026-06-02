import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const debt = await prisma.debt.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    if (!debt) return ok({ error: "الدين غير موجود" }, { status: 404 });
    return ok(debt);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

/**
 * Delete a debt. Only manual (standalone) debts can be deleted here: an
 * invoice-backed debt mirrors the invoice's denormalized money totals, so
 * removing it on its own would desync the invoice — delete/cancel the invoice
 * instead, which voids its linked debt as a side-effect. Recorded payments
 * stay attached to the (now soft-deleted) debt as a historical record.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const debt = await prisma.debt.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true, invoiceId: true },
    });
    if (!debt) return ok({ error: "الدين غير موجود" }, { status: 404 });
    if (debt.invoiceId) {
      return ok(
        { error: "هذا الدين مرتبط بفاتورة. احذف الفاتورة بدلًا من ذلك." },
        { status: 400 }
      );
    }
    await prisma.debt.update({ where: { id }, data: { isDeleted: true } });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const { notes, dueDate, reason, amount, currency } = await req.json();

    const existing = await prisma.debt.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { payments: { select: { amount: true } } },
    });
    if (!existing) return ok({ error: "الدين غير موجود" }, { status: 404 });

    // Money fields are denormalized onto the linked invoice — editing the
    // amount/currency of an invoice-backed debt would desync the invoice, so
    // those stay read-only here (edit the invoice instead). reason/dueDate/
    // notes are always editable.
    const isLinked = !!existing.invoiceId;
    const data: Record<string, unknown> = {};

    if (notes !== undefined) data.notes = notes || null;
    if (reason !== undefined) data.reason = reason || null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    if (amount !== undefined || currency !== undefined) {
      if (isLinked) {
        return ok(
          { error: "لا يمكن تعديل مبلغ أو عملة دين مرتبط بفاتورة. عدّل الفاتورة بدلًا من ذلك." },
          { status: 400 }
        );
      }
    }

    if (currency !== undefined) data.currency = currency;

    if (amount !== undefined) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
      }
      const totalPaid = existing.payments.reduce((s, p) => s + Number(p.amount), 0);
      if (amt < totalPaid) {
        return ok(
          { error: `المبلغ الجديد (${amt.toFixed(2)}) أقل من المسدّد (${totalPaid.toFixed(2)}).` },
          { status: 400 }
        );
      }
      data.amount = amt;
      // Recompute status against existing payments.
      data.status = totalPaid >= amt ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
    }

    if (Object.keys(data).length === 0) {
      return ok({ error: "لا توجد حقول للتعديل" }, { status: 400 });
    }

    await prisma.debt.update({ where: { id }, data });

    const debt = await prisma.debt.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    return ok(debt);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
