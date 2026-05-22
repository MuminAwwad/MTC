import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const category = await prisma.category.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      include: {
        _count: { select: { products: { where: { isDeleted: false } } } },
      },
    });

    if (!category) {
      return ok({ error: "الفئة غير موجودة" }, { status: 404 });
    }

    return ok(category);
  } catch (error) {
    console.error("GET /api/categories/[id]", error);
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

    const normalizedName = parsed.data.name?.trim();

    if (normalizedName) {
      const existing = await prisma.category.findFirst({
        where: {
          ownerId: ctx.dbUser.id,
          name: { equals: normalizedName, mode: "insensitive" },
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (existing) {
        return ok(
          {
            error: `فئة أخرى بنفس الاسم موجودة: ${existing.name}`,
            existingCategoryId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const result = await prisma.category.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { ...parsed.data, name: normalizedName ?? parsed.data.name },
    });

    if (result.count === 0) {
      return ok({ error: "الفئة غير موجودة" }, { status: 404 });
    }

    const category = await prisma.category.findUnique({ where: { id } });
    return ok(category);
  } catch (error) {
    console.error("PUT /api/categories/[id]", error);
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
    const result = await prisma.category.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { isDeleted: true },
    });
    if (result.count === 0) {
      return ok({ error: "الفئة غير موجودة" }, { status: 404 });
    }

    return ok({ success: true });
  } catch (error) {
    console.error("DELETE /api/categories/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
