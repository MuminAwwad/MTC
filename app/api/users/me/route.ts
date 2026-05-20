import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: authUser.email!, mode: "insensitive" },
        isDeleted: false,
      },
      select: { id: true, name: true, email: true, phone: true, address: true, role: true, createdAt: true },
    });

    if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

    const { name, phone, address } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });

    const existing = await prisma.user.findFirst({
      where: {
        email: { equals: authUser.email!, mode: "insensitive" },
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { name: name.trim(), phone: phone || null, address: address || null },
      select: { id: true, name: true, email: true, phone: true, address: true, role: true, createdAt: true },
    });

    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
