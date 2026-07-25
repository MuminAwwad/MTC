import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  email: z.email("بريد إلكتروني غير صالح"),
  role: z.enum(["ADMIN", "STAFF"]),
});

// Employees working inside the current shop (excludes the shop owner
// themselves — they manage the list, they don't appear on it).
export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const employees = await prisma.user.findMany({
    where: { shopOwnerId: ctx.ownerId, isDeleted: false },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return ok(employees);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return ok({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" }, { status: 400 });
  }
  const { name, role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return ok({ error: "هذا البريد الإلكتروني مستخدم مسبقًا" }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: "https://manage.mtcelectronics.com/reset-password",
  });
  if (error || !data.user) {
    console.error("inviteUserByEmail failed", error);
    return ok({ error: "تعذّر إرسال الدعوة عبر البريد الإلكتروني" }, { status: 500 });
  }

  try {
    const employee = await prisma.user.create({
      data: { id: data.user.id, name, email, role, shopOwnerId: ctx.ownerId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    return ok(employee, { status: 201 });
  } catch (e) {
    console.error("failed to create employee row after invite", e);
    return ok({ error: "تم إرسال الدعوة لكن حدث خطأ أثناء حفظ بيانات الموظف" }, { status: 500 });
  }
}
