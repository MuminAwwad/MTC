import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const { amount, note } = await req.json();

    if (!amount || amount <= 0) {
      return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { debts: { where: { isDeleted: false }, include: { payments: true } } },
    });

    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });
    if (invoice.status === "PAID") return ok({ error: "الفاتورة مدفوعة بالكامل" }, { status: 400 });
    if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") {
      return ok({ error: "لا يمكن إضافة دفعة لهذه الفاتورة" }, { status: 400 });
    }

    const remaining = Number(invoice.remainingAmount);
    const payment = Math.min(amount, remaining);
    const newPaid = Number(invoice.paidAmount) + payment;
    const newRemaining = Number(invoice.total) - newPaid;
    const newStatus = newRemaining <= 0 ? "PAID" : "PARTIAL";

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          remainingAmount: Math.max(0, newRemaining),
          status: newStatus,
        },
        include: {
          customer: true,
          items: { include: { product: { select: { id: true, name: true } } } },
          debts: { where: { isDeleted: false }, include: { payments: true } },
        },
      });

      // Allocate the payment across the linked debts, earliest unpaid
      // installment first (by due date, then creation order). Each installment
      // absorbs up to its own remaining balance before the next one is touched.
      const ordered = invoice.debts.slice().sort((a, b) => {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      let leftover = payment;
      for (const debt of ordered) {
        if (leftover <= 0.0001) break;
        const debtPaid = debt.payments.reduce((s, p) => s + Number(p.amount), 0);
        const debtRemaining = Number(debt.amount) - debtPaid;
        if (debtRemaining <= 0) continue;

        const apply = Math.min(debtRemaining, leftover);
        const debtStatus = debtPaid + apply >= Number(debt.amount) ? "PAID" : "PARTIAL";

        await tx.debtPayment.create({
          data: { debtId: debt.id, amount: apply, note: note ?? null, createdById: ctx.dbUser.id },
        });
        await tx.debt.update({ where: { id: debt.id }, data: { status: debtStatus } });
        leftover -= apply;
      }

      return inv;
    });

    return ok(updated);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
