import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const debt = await prisma.debt.findFirst({
      where: { id, isDeleted: false },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    if (!debt) return NextResponse.json({ error: "الدين غير موجود" }, { status: 404 });
    return NextResponse.json(debt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { notes, dueDate } = await req.json();
    const debt = await prisma.debt.update({
      where: { id },
      data: {
        ...(notes !== undefined ? { notes } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        payments: { orderBy: { paidAt: "asc" } },
      },
    });
    return NextResponse.json(debt);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
