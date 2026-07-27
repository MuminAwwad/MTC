import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DebtStatus, Currency } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") as DebtStatus | null;
    const supplierId = searchParams.get("supplierId") ?? "";

    const where = {
      ownerId: ctx.ownerId,
      isDeleted: false,
      // Default view is unpaid payables only. The PAID tab is an explicit
      // opt-in to view history; otherwise the list matches the definition
      // of "payable" = money still owed to a supplier.
      ...(status ? { status } : { status: { not: "PAID" as const } }),
      ...(supplierId ? { supplierId } : {}),
      ...(search
        ? { supplier: { name: { contains: search, mode: "insensitive" as const } } }
        : {}),
    };

    const [payables, total, outstandingRows] = await Promise.all([
      prisma.payable.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      }),
      prisma.payable.count({ where }),
      // Outstanding = sum(amount) − sum(payments). A PARTIAL payable already
      // has some payments recorded, so summing `amount` alone over-reports
      // what's still owed.
      prisma.payable.findMany({
        where: { ownerId: ctx.ownerId, isDeleted: false, status: { not: "PAID" } },
        select: { amount: true, payments: { select: { amount: true } } },
      }),
    ]);
    const totalOutstanding = outstandingRows.reduce((sum, p) => {
      const paid = p.payments.reduce((s, pay) => s + Number(pay.amount), 0);
      return sum + Number(p.amount) - paid;
    }, 0);

    return ok({
      payables,
      total,
      page,
      pageCount: Math.ceil(total / ITEMS_PER_PAGE),
      totalOutstanding,
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
    const { supplierId, amount, currency = "ILS", reason, dueDate, notes } = await req.json();

    if (!supplierId) return ok({ error: "المورد مطلوب" }, { status: 400 });
    if (!amount || amount <= 0) return ok({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, ownerId: ctx.ownerId, isDeleted: false },
      select: { id: true },
    });
    if (!supplier) return ok({ error: "المورد غير موجود" }, { status: 404 });

    const payable = await prisma.payable.create({
      data: {
        ownerId: ctx.ownerId,
        supplierId,
        amount,
        currency: currency as Currency,
        reason: reason || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes || null,
        status: "PENDING",
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        payments: true,
      },
    });

    return ok(payable, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
