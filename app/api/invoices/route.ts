import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { InvoiceStatus } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") as InvoiceStatus | null;
    const customerId = searchParams.get("customerId") ?? "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where = {
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
      where: { isDeleted: false, ...(status ? { status } : {}) },
      _sum: { total: true, paidAmount: true, remainingAmount: true },
    });

    return NextResponse.json({
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
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customerId,
      items,
      discountAmount = 0,
      discountPercent = 0,
      taxPercent = 0,
      currency = "ILS",
      exchangeRate = 1,
      notes,
      status = "DRAFT",
      paidAmount = 0,
    } = body;

    if (!customerId) return NextResponse.json({ error: "العميل مطلوب" }, { status: 400 });
    if (!items || items.length === 0) return NextResponse.json({ error: "يجب إضافة منتج واحد على الأقل" }, { status: 400 });

    const subtotal = items.reduce((sum: number, item: { qty: number; unitPrice: number; discount: number }) => {
      const lineTotal = item.qty * item.unitPrice - (item.discount ?? 0);
      return sum + lineTotal;
    }, 0);

    const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
    const taxableAmount = subtotal - discAmt;
    const taxAmount = taxPercent > 0 ? taxableAmount * (taxPercent / 100) : 0;
    const total = taxableAmount + taxAmount;
    const paid = Math.min(paidAmount, total);
    const remaining = total - paid;

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateInvoiceNumber(tx);

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
          invoiceNumber,
          customerId,
          subtotal,
          discountAmount: discAmt,
          discountPercent,
          taxPercent,
          taxAmount,
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
            }) => ({
              productId: item.productId ?? null,
              name: item.name,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              total: item.qty * item.unitPrice - (item.discount ?? 0),
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
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product) continue;
            const newQty = product.stockQty - item.qty;
            await tx.product.update({ where: { id: item.productId }, data: { stockQty: Math.max(0, newQty) } });
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
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
              customerId,
              invoiceId: created.id,
              amount: remaining,
              currency,
              reason: `فاتورة ${invoiceNumber}`,
              status: "PENDING",
            },
          });
        }
      }

      return created;
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
