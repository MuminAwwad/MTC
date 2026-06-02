import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    });

    if (!customer) {
      return ok({ error: "العميل غير موجود" }, { status: 404 });
    }

    const [invoices, tickets, debts, spentAgg] = await Promise.all([
      prisma.invoice.findMany({
        where: { customerId: id, ownerId: ctx.dbUser.id, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paidAmount: true,
          remainingAmount: true,
          status: true,
          currency: true,
          createdAt: true,
        },
      }),
      prisma.maintenanceTicket.findMany({
        where: { customerId: id, ownerId: ctx.dbUser.id, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          ticketNumber: true,
          deviceType: true,
          deviceBrand: true,
          deviceModel: true,
          status: true,
          priority: true,
          finalCost: true,
          estimatedCost: true,
          receivedAt: true,
          deliveredAt: true,
        },
      }),
      prisma.debt.findMany({
        where: { customerId: id, ownerId: ctx.dbUser.id, isDeleted: false },
        orderBy: { createdAt: "desc" },
        include: {
          payments: { orderBy: { paidAt: "desc" } },
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      prisma.invoice.aggregate({
        where: {
          customerId: id,
          ownerId: ctx.dbUser.id,
          status: { in: ["PAID", "PARTIAL", "ISSUED"] },
          isDeleted: false,
        },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const totalDebt = debts
      .filter((d) => d.status !== "PAID")
      .reduce((sum, d) => {
        const paid = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        return sum + Number(d.amount) - paid;
      }, 0);

    return ok({
      ...customer,
      invoices,
      tickets,
      debts,
      stats: {
        totalSpent: Number(spentAgg._sum.total ?? 0),
        invoiceCount: spentAgg._count,
        ticketCount: tickets.length,
        openDebt: totalDebt,
      },
    });
  } catch (error) {
    console.error("GET /api/customers/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return ok({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const normalizedPhone = parsed.data.phone?.trim() || null;

    if (normalizedPhone) {
      const existing = await prisma.customer.findFirst({
        where: {
          ownerId: ctx.dbUser.id,
          phone: normalizedPhone,
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (existing) {
        return ok(
          {
            error: `عميل آخر بنفس رقم الهاتف موجود: ${existing.name}`,
            existingCustomerId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    // updateMany lets us include ownerId in the WHERE so users can't edit
    // another shop's customer by guessing the id.
    const result = await prisma.customer.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { ...parsed.data, phone: normalizedPhone },
    });

    if (result.count === 0) {
      return ok({ error: "العميل غير موجود" }, { status: 404 });
    }

    const customer = await prisma.customer.findUnique({ where: { id } });
    return ok(customer);
  } catch (error) {
    console.error("PUT /api/customers/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const result = await prisma.customer.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { isDeleted: true },
    });
    if (result.count === 0) {
      return ok({ error: "العميل غير موجود" }, { status: 404 });
    }
    return ok({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
