import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { amount, note } = await req.json();

    if (!amount || amount <= 0) {
      return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, isDeleted: false },
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

      const debt = invoice.debts[0];
      if (debt) {
        const debtPaid = debt.payments.reduce((s, p) => s + Number(p.amount), 0) + payment;
        const debtTotal = Number(debt.amount);
        const debtStatus = debtPaid >= debtTotal ? "PAID" : "PARTIAL";

        await tx.debtPayment.create({
          data: { debtId: debt.id, amount: payment, note },
        });
        await tx.debt.update({
          where: { id: debt.id },
          data: { status: debtStatus },
        });
      }

      return inv;
    });

    return ok(updated);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
