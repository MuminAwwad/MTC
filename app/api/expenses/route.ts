import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Currency } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const categoryId = searchParams.get("categoryId") ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where = {
      ownerId: ctx.dbUser.id,
      isDeleted: false,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { description: { contains: search, mode: "insensitive" as const } } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
            },
          }
        : {}),
    };

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy: { date: "desc" },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      }),
      prisma.expense.count({ where }),
    ]);

    const summary = await prisma.expense.aggregate({
      where: { ownerId: ctx.dbUser.id, isDeleted: false },
      _sum: { amount: true },
    });

    return ok({
      expenses,
      total,
      page,
      pageCount: Math.ceil(total / ITEMS_PER_PAGE),
      totalAmount: Number(summary._sum.amount ?? 0),
    });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { categoryId, amount, currency = "ILS", description, date } = await req.json();

    if (!amount || amount <= 0) return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });

    if (categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: categoryId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!category) return ok({ error: "الفئة غير موجودة" }, { status: 404 });
    }

    const expense = await prisma.expense.create({
      data: {
        ownerId: ctx.dbUser.id,
        categoryId: categoryId || null,
        amount,
        currency: currency as Currency,
        description: description || null,
        date: date ? new Date(date) : new Date(),
        createdById: ctx.dbUser.id,
      },
      include: { category: true },
    });

    return ok(expense, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await req.json();
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
