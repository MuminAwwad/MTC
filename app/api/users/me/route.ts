import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  const user = await prisma.user.findFirst({
    where: { id: ctx.dbUser.id, isDeleted: false },
    select: { id: true, name: true, email: true, phone: true, address: true, role: true, createdAt: true },
  });
  if (!user) return ok({ error: "المستخدم غير موجود" }, { status: 404 });
  return ok(user);
}

export async function PUT(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { name, phone, address } = await req.json();
    if (!name?.trim()) return ok({ error: "الاسم مطلوب" }, { status: 400 });

    const user = await prisma.user.update({
      where: { id: ctx.dbUser.id },
      data: { name: name.trim(), phone: phone || null, address: address || null },
      select: { id: true, name: true, email: true, phone: true, address: true, role: true, createdAt: true },
    });
    return ok(user);
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
