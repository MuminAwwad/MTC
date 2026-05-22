import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Per-shop isolation: a user only ever sees themselves. The list endpoint
// returns the current user as a single-element array so any consumer that
// expected a list still works.
export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  const user = await prisma.user.findUnique({
    where: { id: ctx.dbUser.id },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
  });
  return ok(user ? [user] : []);
}

export async function POST() {
  return ok({ error: "إنشاء المستخدمين يتم عبر التسجيل" }, { status: 405 });
}
