import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const category = await prisma.category.findFirst({
      where: { id, isDeleted: false },
      include: {
        _count: { select: { products: { where: { isDeleted: false } } } },
      },
    });

    if (!category) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error("GET /api/categories/[id]", error);
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

    const normalizedName = parsed.data.name?.trim();

    if (normalizedName) {
      const existing = await prisma.category.findFirst({
        where: {
          name: { equals: normalizedName, mode: "insensitive" },
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            error: `فئة أخرى بنفس الاسم موجودة: ${existing.name}`,
            existingCategoryId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: { ...parsed.data, name: normalizedName ?? parsed.data.name },
    });

    return NextResponse.json(category);
  } catch (error) {
    console.error("PUT /api/categories/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.category.update({
      where: { id },
      data: { isDeleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/categories/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
