import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

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
  try {
    const { id } = await params;
    const supplier = await prisma.supplier.findFirst({
      where: { id, isDeleted: false },
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
      return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 });
    }

    return NextResponse.json(supplier);
  } catch (error) {
    console.error("GET /api/suppliers/[id]", error);
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
      const existing = await prisma.supplier.findFirst({
        where: { phone: normalizedPhone, isDeleted: false, NOT: { id } },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `مورد آخر بنفس رقم الهاتف موجود: ${existing.name}`,
            existingSupplierId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: { ...parsed.data, phone: normalizedPhone },
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error("PUT /api/suppliers/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.supplier.update({
      where: { id },
      data: { isDeleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/suppliers/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
