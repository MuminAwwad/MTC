import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

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
  try {
    const { id } = await params;

    const customer = await prisma.customer.findFirst({
      where: { id, isDeleted: false },
    });

    if (!customer) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
    }

    // Fetch related data in parallel
    const [invoices, tickets, debts, spentAgg] = await Promise.all([
      prisma.invoice.findMany({
        where: { customerId: id, isDeleted: false },
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
        where: { customerId: id, isDeleted: false },
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
        where: { customerId: id, isDeleted: false },
        orderBy: { createdAt: "desc" },
        include: {
          payments: { orderBy: { paidAt: "desc" } },
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      prisma.invoice.aggregate({
        where: {
          customerId: id,
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

    return NextResponse.json({
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
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const normalizedPhone = parsed.data.phone?.trim() || null;

    if (normalizedPhone) {
      const existing = await prisma.customer.findFirst({
        where: { phone: normalizedPhone, isDeleted: false, NOT: { id } },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `عميل آخر بنفس رقم الهاتف موجود: ${existing.name}`,
            existingCustomerId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { ...parsed.data, phone: normalizedPhone },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error("PUT /api/customers/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.customer.update({
      where: { id },
      data: { isDeleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/customers/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
