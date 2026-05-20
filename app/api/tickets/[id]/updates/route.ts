import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const { note } = await req.json();

    if (!note?.trim()) return ok({ error: "الملاحظة مطلوبة" }, { status: 400 });

    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id, isDeleted: false } });
    if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });

    const update = await prisma.ticketUpdate.create({
      data: { ticketId: id, status: ticket.status, note, createdById: ctx.dbUser.id },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return ok(update, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
