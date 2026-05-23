import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { Currency, InvoiceStatus } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { decrementStockOrFail, InsufficientStockError } from "@/lib/stock";
import { requireUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") as InvoiceStatus | null;
    const customerId = searchParams.get("customerId") ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where = {
      ownerId: ctx.dbUser.id,
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: "insensitive" as const } },
              { customer: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
            },
          }
        : {}),
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      }),
      prisma.invoice.count({ where }),
    ]);

    const summary = await prisma.invoice.aggregate({
      // Exclude CANCELLED from the totals — they no longer represent money
      // owed/earned. The "Cancelled" filter tab can still opt-in.
      where: {
        ownerId: ctx.dbUser.id,
        isDeleted: false,
        ...(status ? { status } : { status: { not: "CANCELLED" } }),
      },
      _sum: { total: true, paidAmount: true, remainingAmount: true },
    });

    return ok({
      invoices,
      total,
      page,
      pageCount: Math.ceil(total / ITEMS_PER_PAGE),
      summary: {
        total: Number(summary._sum.total ?? 0),
        paid: Number(summary._sum.paidAmount ?? 0),
        remaining: Number(summary._sum.remainingAmount ?? 0),
      },
    });
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

    type InvoiceItemInput = {
      productId?: string;
      name: string;
      qty: number;
      unitPrice: number;
      discount?: number;
      source?: "SALE" | "TICKET_PART" | "TICKET_LABOR";
    };

    const {
      customerId,
      items,
      discountAmount = 0,
      discountPercent = 0,
      taxPercent = 0,
      deliveryFee = 0,
      currency = "ILS",
      exchangeRate = 1,
      notes,
      status = "DRAFT",
      paidAmount = 0,
      ticketId,
      debt: debtDetails,
    } = body as {
      customerId?: string;
      items?: InvoiceItemInput[];
      discountAmount?: number;
      discountPercent?: number;
      taxPercent?: number;
      deliveryFee?: number;
      currency?: Currency;
      exchangeRate?: number;
      notes?: string | null;
      status?: "DRAFT" | "ISSUED" | "PAID" | "PARTIAL" | string;
      paidAmount?: number;
      ticketId?: string;
      debt?: { dueDate?: string; notes?: string };
    };

    if (!customerId) return ok({ error: "العميل مطلوب" }, { status: 400 });
    if (!items || items.length === 0) return ok({ error: "يجب إضافة منتج واحد على الأقل" }, { status: 400 });

    if (ticketId) {
      const existing = await prisma.invoice.findFirst({
        where: { ticketId, ownerId: ctx.dbUser.id },
        select: { id: true, invoiceNumber: true },
      });
      if (existing) {
        return ok(
          { error: `هذه التذكرة مرتبطة بفاتورة مسبقًا: ${existing.invoiceNumber}`, existingInvoiceId: existing.id },
          { status: 409 }
        );
      }

      const ticket = await prisma.maintenanceTicket.findFirst({
        where: { id: ticketId, ownerId: ctx.dbUser.id, isDeleted: false },
        select: { id: true },
      });
      if (!ticket) return ok({ error: "التذكرة غير موجودة" }, { status: 404 });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true },
    });
    if (!customer) return ok({ error: "العميل غير موجود" }, { status: 404 });

    const subtotal = items.reduce((sum: number, item) => {
      const lineTotal = item.qty * item.unitPrice - (item.discount ?? 0);
      return sum + lineTotal;
    }, 0);

    const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
    const taxableAmount = subtotal - discAmt;
    const taxAmount = taxPercent > 0 ? taxableAmount * (taxPercent / 100) : 0;
    // Delivery fee is a flat add-on the cashier types in — added after tax,
    // not part of the taxable base.
    const delivery = Math.max(0, Number(deliveryFee) || 0);
    const total = taxableAmount + taxAmount + delivery;
    const paid = Math.min(paidAmount, total);
    const remaining = total - paid;

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx, ctx.dbUser.id);

      const invoiceStatus: InvoiceStatus =
        status === "ISSUED"
          ? paid >= total
            ? "PAID"
            : paid > 0
            ? "PARTIAL"
            : "ISSUED"
          : "DRAFT";

      const created = await tx.invoice.create({
        data: {
          ownerId: ctx.dbUser.id,
          invoiceNumber,
          customerId,
          createdById: ctx.dbUser.id,
          ticketId: ticketId ?? null,
          subtotal,
          discountAmount: discAmt,
          discountPercent,
          taxPercent,
          taxAmount,
          deliveryFee: delivery,
          total,
          paidAmount: paid,
          remainingAmount: remaining,
          currency,
          exchangeRate,
          notes,
          status: invoiceStatus,
          items: {
            create: items.map((item: {
              productId?: string;
              name: string;
              qty: number;
              unitPrice: number;
              discount?: number;
              source?: "SALE" | "TICKET_PART" | "TICKET_LABOR";
            }) => ({
              productId: item.productId ?? null,
              name: item.name,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              total: item.qty * item.unitPrice - (item.discount ?? 0),
              source: item.source ?? "SALE",
            })),
          },
        },
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      });

      if (invoiceStatus !== "DRAFT") {
        for (const item of items) {
          if (item.productId && item.qty > 0) {
            await decrementStockOrFail(tx, item.productId, item.qty);
            await tx.stockMovement.create({
              data: {
                ownerId: ctx.dbUser.id,
                productId: item.productId,
                createdById: ctx.dbUser.id,
                type: "OUT",
                qty: item.qty,
                note: `فاتورة ${invoiceNumber}`,
                reference: invoiceNumber,
              },
            });
          }
        }

        if (remaining > 0) {
          await tx.debt.create({
            data: {
              ownerId: ctx.dbUser.id,
              customerId,
              invoiceId: created.id,
              amount: remaining,
              currency,
              reason: `فاتورة ${invoiceNumber}`,
              status: "PENDING",
              dueDate: debtDetails?.dueDate ? new Date(debtDetails.dueDate) : null,
              notes: debtDetails?.notes ?? null,
            },
          });
        }

        // If this invoice was generated from a repair ticket, mark
        // the ticket DELIVERED once the invoice is issued.
        if (ticketId) {
          await tx.maintenanceTicket.update({
            where: { id: ticketId },
            data: { status: "DELIVERED", deliveredAt: new Date() },
          });
          await tx.ticketUpdate.create({
            data: {
              ticketId,
              status: "DELIVERED",
              note: `تم التسليم وإصدار الفاتورة ${invoiceNumber}`,
              createdById: ctx.dbUser.id,
            },
          });
        }
      }

      return created;
    });

    return ok(invoice, { status: 201 });
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return ok({ error: e.message }, { status: 409 });
    }
    console.error(e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
