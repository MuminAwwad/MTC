import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Currency } from "@prisma/client";
import { requireUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = await req.json();
    const { categoryId, amount, currency, description, date } = body;

    const expense = await prisma.expense.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!expense) return ok({ error: "المصروف غير موجود" }, { status: 404 });

    if (amount !== undefined && (typeof amount !== "number" || amount <= 0)) {
      return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    if (categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: categoryId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!category) return ok({ error: "الفئة غير موجودة" }, { status: 404 });
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
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const result = await prisma.expense.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { isDeleted: true },
    });
    if (result.count === 0) return ok({ error: "المصروف غير موجود" }, { status: 404 });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
