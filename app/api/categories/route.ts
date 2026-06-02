import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  slug: z.string().min(1).optional(),
  icon: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";

    const categories = await prisma.category.findMany({
      where: {
        ownerId: ctx.dbUser.id,
        isDeleted: false,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      include: {
        _count: { select: { products: { where: { isDeleted: false, isActive: true } } } },
      },
      orderBy: { name: "asc" },
    });

    return ok(categories);
  } catch (error) {
    console.error("GET /api/categories", error);
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

    const { icon } = parsed.data;
    const name = parsed.data.name.trim();

    const existing = await prisma.category.findFirst({
      where: {
        ownerId: ctx.dbUser.id,
        name: { equals: name, mode: "insensitive" },
        isDeleted: false,
      },
      select: { id: true, name: true },
    });

    if (existing) {
      return ok(
        {
          error: `فئة بنفس الاسم موجودة مسبقًا: ${existing.name}`,
          existingCategoryId: existing.id,
        },
        { status: 409 }
      );
    }

    const slug =
      parsed.data.slug ??
      name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9؀-ۿ-]/g, "")
        .slice(0, 50) +
        "-" +
        Date.now();

    const category = await prisma.category.create({
      data: { ownerId: ctx.dbUser.id, name, slug, icon },
    });

    return ok(category, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
