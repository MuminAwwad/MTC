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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const { notes, dueDate } = await req.json();
    const result = await prisma.debt.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: {
        ...(notes !== undefined ? { notes } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    });
    if (result.count === 0) return ok({ error: "الدين غير موجود" }, { status: 404 });

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
