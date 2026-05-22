import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1, "اسم العميل مطلوب"),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = parseInt(searchParams.get("limit") ?? String(ITEMS_PER_PAGE));
    const all = searchParams.get("all") === "true";

    const where = {
      ownerId: ctx.dbUser.id,
      isDeleted: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    if (all) {
      const customers = await prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true },
      });
      return ok(customers);
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: {
              invoices: { where: { isDeleted: false } },
              maintenanceTickets: { where: { isDeleted: false } },
              debts: { where: { isDeleted: false } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    const customerIds = customers.map((c) => c.id);
    const spentData = await prisma.invoice.groupBy({
      by: ["customerId"],
      where: {
        ownerId: ctx.dbUser.id,
        customerId: { in: customerIds },
        status: { in: ["PAID", "PARTIAL", "ISSUED"] },
        isDeleted: false,
      },
      _sum: { total: true },
    });
    const spentMap = Object.fromEntries(
      spentData.map((d) => [d.customerId, Number(d._sum.total ?? 0)])
    );

    const result = customers.map((c) => ({
      ...c,
      totalSpent: spentMap[c.id] ?? 0,
    }));

    return ok({
      data: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/customers", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return ok(
        { error: "بيانات غير صالحة", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const normalizedPhone = parsed.data.phone?.trim() || null;

    if (normalizedPhone) {
      const existing = await prisma.customer.findFirst({
        where: { ownerId: ctx.dbUser.id, phone: normalizedPhone, isDeleted: false },
        select: { id: true, name: true },
      });
      if (existing) {
        return ok(
          {
            error: `عميل بنفس رقم الهاتف موجود مسبقًا: ${existing.name}`,
            existingCustomerId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const customer = await prisma.customer.create({
      data: {
        ownerId: ctx.dbUser.id,
        name: parsed.data.name,
        phone: normalizedPhone,
        address: parsed.data.address ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    return ok(customer, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
