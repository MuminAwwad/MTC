import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { Currency } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const categoryId = searchParams.get("categoryId") ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where = {
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
      where: { isDeleted: false },
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
  try {
    const { categoryId, amount, currency = "ILS", description, date } = await req.json();

    if (!amount || amount <= 0) return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });

    const expense = await prisma.expense.create({
      data: {
        categoryId: categoryId || null,
        amount,
        currency: currency as Currency,
        description: description || null,
        date: date ? new Date(date) : new Date(),
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
  try {
    const { id } = await req.json();
    await prisma.expense.update({ where: { id }, data: { isDeleted: true } });
    return ok({ success: true });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
