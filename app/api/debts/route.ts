import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DebtStatus, Currency } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") as DebtStatus | null;
    const customerId = searchParams.get("customerId") ?? "";

    const where = {
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search
        ? { customer: { name: { contains: search, mode: "insensitive" as const } } }
        : {}),
    };

    const [debts, total] = await Promise.all([
      prisma.debt.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      }),
      prisma.debt.count({ where }),
    ]);

    const summary = await prisma.debt.aggregate({
      where: { isDeleted: false, status: { not: "PAID" } },
      _sum: { amount: true },
    });

    return ok({
      debts,
      total,
      page,
      pageCount: Math.ceil(total / ITEMS_PER_PAGE),
      totalOutstanding: Number(summary._sum.amount ?? 0),
    });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { customerId, amount, currency = "ILS", reason, dueDate, notes } = await req.json();

    if (!customerId) return ok({ error: "العميل مطلوب" }, { status: 400 });
    if (!amount || amount <= 0) return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });

    const debt = await prisma.debt.create({
      data: {
        customerId,
        amount,
        currency: currency as Currency,
        reason: reason || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes || null,
        status: "PENDING",
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: true,
      },
    });

    return ok(debt, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
