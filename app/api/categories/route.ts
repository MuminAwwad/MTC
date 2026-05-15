import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  slug: z.string().min(1).optional(),
  icon: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";

    const categories = await prisma.category.findMany({
      where: {
        isDeleted: false,
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      include: {
        _count: { select: { products: { where: { isDeleted: false, isActive: true } } } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("GET /api/categories", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, icon } = parsed.data;
    const slug =
      parsed.data.slug ??
      name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9؀-ۿ-]/g, "")
        .slice(0, 50) +
        "-" +
        Date.now();

    const existing = await prisma.category.findFirst({
      where: { slug, isDeleted: false },
    });

    if (existing) {
      return NextResponse.json({ error: "الفئة موجودة مسبقًا" }, { status: 409 });
    }

    const category = await prisma.category.create({
      data: { name, slug, icon },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
