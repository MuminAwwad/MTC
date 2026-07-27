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

    const payable = await prisma.payable.findFirst({
      where: { id, ownerId: ctx.ownerId, isDeleted: false },
      include: { payments: true },
    });
    if (!payable) return ok({ error: "المستحق غير موجود" }, { status: 404 });
    if (payable.status === "PAID") return ok({ error: "المستحق مسدد بالكامل" }, { status: 400 });

    const totalPaid = payable.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Number(payable.amount) - totalPaid;
    const payment = Math.min(amount, remaining);
    const newTotalPaid = totalPaid + payment;
    const newStatus = newTotalPaid >= Number(payable.amount) ? "PAID" : "PARTIAL";

    const updated = await prisma.$transaction(async (tx) => {
      await tx.payablePayment.create({
        data: { payableId: id, amount: payment, note: note || null, createdById: ctx.dbUser.id },
      });
      return tx.payable.update({
        where: { id },
        data: { status: newStatus },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          payments: { orderBy: { paidAt: "asc" } },
        },
      });
    });

    return ok(updated);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
