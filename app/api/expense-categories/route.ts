import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { ownerId: ctx.dbUser.id, isDeleted: false },
      orderBy: { name: "asc" },
    });
    return ok(categories);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { name, icon, color } = await req.json();
    const normalized = name?.trim();
    if (!normalized) return ok({ error: "الاسم مطلوب" }, { status: 400 });

    const existing = await prisma.expenseCategory.findFirst({
      where: {
        ownerId: ctx.dbUser.id,
        name: { equals: normalized, mode: "insensitive" },
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

    const cat = await prisma.expenseCategory.create({
      data: {
        ownerId: ctx.dbUser.id,
        name: normalized,
        icon: icon || null,
        color: color || null,
      },
    });
    return ok(cat, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
