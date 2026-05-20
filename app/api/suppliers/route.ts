import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { ITEMS_PER_PAGE } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(1, "اسم المورد مطلوب"),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = parseInt(searchParams.get("limit") ?? String(ITEMS_PER_PAGE));
    const all = searchParams.get("all") === "true";

    const where = {
      isDeleted: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    if (all) {
      const suppliers = await prisma.supplier.findMany({
        where,
        orderBy: { name: "asc" },
      });
      return ok(suppliers);
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: {
              products: { where: { isDeleted: false } },
              payables: { where: { isDeleted: false } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    return ok({
      data: suppliers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/suppliers", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
      const existing = await prisma.supplier.findFirst({
        where: { phone: normalizedPhone, isDeleted: false },
        select: { id: true, name: true },
      });
      if (existing) {
        return ok(
          {
            error: `مورد بنفس رقم الهاتف موجود مسبقًا: ${existing.name}`,
            existingSupplierId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        phone: normalizedPhone,
        company: parsed.data.company ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    return ok(supplier, { status: 201 });
  } catch (error) {
    console.error("POST /api/suppliers", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
