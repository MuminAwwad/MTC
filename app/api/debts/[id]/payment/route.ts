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

    const debt = await prisma.debt.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: { payments: true },
    });
    if (!debt) return ok({ error: "الدين غير موجود" }, { status: 404 });
    if (debt.status === "PAID") return ok({ error: "الدين مسدد بالكامل" }, { status: 400 });

    const totalPaid = debt.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(debt.amount) - totalPaid;
    const payment = Math.min(amount, remaining);
    const newTotalPaid = totalPaid + payment;
    const newStatus = newTotalPaid >= Number(debt.amount) ? "PAID" : "PARTIAL";

    const updated = await prisma.$transaction(async (tx) => {
      await tx.debtPayment.create({
        data: { debtId: id, amount: payment, note: note || null, createdById: ctx.dbUser.id },
      });
      const updatedDebt = await tx.debt.update({
        where: { id },
        data: { status: newStatus },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          payments: { orderBy: { paidAt: "asc" } },
        },
      });

      // Sync linked invoice if exists
      if (debt.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: debt.invoiceId } });
        if (invoice) {
          const newPaid = Number(invoice.paidAmount) + payment;
          const newRemaining = Math.max(0, Number(invoice.total) - newPaid);
          const invoiceStatus = newRemaining <= 0 ? "PAID" : "PARTIAL";
          await tx.invoice.update({
            where: { id: debt.invoiceId },
            data: { paidAmount: newPaid, remainingAmount: newRemaining, status: invoiceStatus },
          });
        }
      }

      return updatedDebt;
    });

    return ok(updated);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
