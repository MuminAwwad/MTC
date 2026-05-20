import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { generateTicketNumber } from "@/lib/invoice-number";
import { TicketStatus, TicketPriority, DeviceType } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") as TicketStatus | null;
    const priority = searchParams.get("priority") as TicketPriority | null;
    const customerId = searchParams.get("customerId") ?? "";
    const unbilled = searchParams.get("unbilled") === "true";
    const all = searchParams.get("all") === "true";

    const where = {
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(customerId ? { customerId } : {}),
      ...(unbilled ? { invoice: { is: null } } : {}),
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search, mode: "insensitive" as const } },
              { customer: { name: { contains: search, mode: "insensitive" as const } } },
              { deviceBrand: { contains: search, mode: "insensitive" as const } },
              { deviceModel: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.maintenanceTicket.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { parts: true, timeline: true } },
        },
        orderBy: { createdAt: "desc" },
        ...(all ? {} : { skip: (page - 1) * ITEMS_PER_PAGE, take: ITEMS_PER_PAGE }),
      }),
      prisma.maintenanceTicket.count({ where }),
    ]);

    return ok({ tickets, total, page, pageCount: Math.ceil(total / ITEMS_PER_PAGE) });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const {
      customerId,
      deviceType,
      deviceBrand,
      deviceModel,
      serialNumber,
      problemDescription,
      priority = "NORMAL",
      estimatedCost,
      depositPaid = 0,
      estimatedDelivery,
      customerNotes,
      technicianNotes,
    } = body;

    if (!customerId) return ok({ error: "العميل مطلوب" }, { status: 400 });
    if (!deviceType) return ok({ error: "نوع الجهاز مطلوب" }, { status: 400 });
    if (!problemDescription?.trim()) return ok({ error: "وصف المشكلة مطلوب" }, { status: 400 });

    const ticket = await prisma.$transaction(async (tx) => {
      const ticketNumber = await generateTicketNumber(tx);
      return tx.maintenanceTicket.create({
        data: {
          ticketNumber,
          customerId,
          createdById: ctx.dbUser.id,
          deviceType: deviceType as DeviceType,
          deviceBrand: deviceBrand || null,
          deviceModel: deviceModel || null,
          serialNumber: serialNumber || null,
          problemDescription,
          priority: priority as TicketPriority,
          estimatedCost: estimatedCost ?? null,
          depositPaid: depositPaid ?? 0,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          customerNotes: customerNotes || null,
          technicianNotes: technicianNotes || null,
          status: "RECEIVED",
          timeline: {
            create: { status: "RECEIVED", note: "تم استلام الجهاز" },
          },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      });
    });

    return ok(ticket, { status: 201 });
  } catch (e) {
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
