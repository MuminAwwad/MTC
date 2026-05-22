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
      // Hide debts whose linked invoice was cancelled. NOT { invoice: ... }
      // is false only when an invoice exists AND its status matches; debts
      // with no invoice (invoiceId null) pass through unaffected.
      NOT: { invoice: { status: "CANCELLED" as const } },
      // Default view is unpaid debts only. The PAID tab is an explicit
      // opt-in to view history; otherwise the list matches the definition
      // of "debt" = customer money still owed.
      ...(status ? { status } : { status: { not: "PAID" as const } }),
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

    // Outstanding = sum(debt.amount) − sum(payments). A PARTIAL debt
    // already has some payments recorded, so summing `amount` alone
    // over-reports what customers still owe.
    const outstandingRows = await prisma.debt.findMany({
      where: {
        isDeleted: false,
        status: { not: "PAID" },
        NOT: { invoice: { status: "CANCELLED" as const } },
      },
      select: { amount: true, payments: { select: { amount: true } } },
    });
    const totalOutstanding = outstandingRows.reduce((sum, d) => {
      const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Number(d.amount) - paid;
    }, 0);

    return ok({
      debts,
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
