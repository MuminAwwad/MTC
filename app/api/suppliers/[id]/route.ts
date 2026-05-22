import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
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
    const supplier = await prisma.supplier.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        products: {
          where: { isDeleted: false },
          orderBy: { name: "asc" },
        },
        payables: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { payments: true },
        },
        _count: {
          select: {
            products: { where: { isDeleted: false } },
            payables: { where: { isDeleted: false } },
          },
        },
      },
    });

    if (!supplier) {
      return ok({ error: "المورد غير موجود" }, { status: 404 });
    }

    return ok(supplier);
  } catch (error) {
    console.error("GET /api/suppliers/[id]", error);
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
      const existing = await prisma.supplier.findFirst({
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
            error: `مورد آخر بنفس رقم الهاتف موجود: ${existing.name}`,
            existingSupplierId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const result = await prisma.supplier.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { ...parsed.data, phone: normalizedPhone },
    });

    if (result.count === 0) {
      return ok({ error: "المورد غير موجود" }, { status: 404 });
    }

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    return ok(supplier);
  } catch (error) {
    console.error("PUT /api/suppliers/[id]", error);
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
    const result = await prisma.supplier.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { isDeleted: true },
    });
    if (result.count === 0) {
      return ok({ error: "المورد غير موجود" }, { status: 404 });
    }
    return ok({ success: true });
  } catch (error) {
    console.error("DELETE /api/suppliers/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
