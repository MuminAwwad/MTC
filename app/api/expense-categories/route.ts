import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { isDeleted: false },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, icon, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
    const cat = await prisma.expenseCategory.create({
      data: { name: name.trim(), icon: icon || null, color: color || null },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
