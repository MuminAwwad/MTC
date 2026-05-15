import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { note } = await req.json();

    if (!note?.trim()) return NextResponse.json({ error: "الملاحظة مطلوبة" }, { status: 400 });

    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, isDeleted: false } });
    if (!ticket) return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });

    const update = await prisma.ticketUpdate.create({
      data: { ticketId: id, status: ticket.status, note },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json(update, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
