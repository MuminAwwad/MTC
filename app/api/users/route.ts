import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id, name, email, phone, address, role } = await req.json();

    if (!id || !name || !email) {
      return NextResponse.json({ error: "البيانات ناقصة" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true, name: true, email: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: `مستخدم بنفس البريد الإلكتروني موجود مسبقًا: ${existing.name}`,
          existingUserId: existing.id,
        },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        id,
        name,
        email: normalizedEmail,
        phone: phone ?? null,
        address: address ?? null,
        role: role === "ADMIN" ? "ADMIN" : "STAFF",
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
