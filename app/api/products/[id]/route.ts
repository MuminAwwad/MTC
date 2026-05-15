import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  unit: z.enum(["PIECE", "BOX", "SET", "METER", "OTHER"]).optional(),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  costPrice: z.coerce.number().min(0).optional(),
  sellPrice: z.coerce.number().min(0).optional(),
  minStockQty: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        category: true,
        supplier: true,
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { createdBy: { select: { name: true } } },
        },
        invoiceItems: {
          orderBy: { invoice: { createdAt: "desc" } },
          take: 10,
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                createdAt: true,
                status: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
        _count: { select: { invoiceItems: true, stockMovements: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("GET /api/products/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const data = parsed.data;

    if (data.sku) {
      const exists = await prisma.product.findFirst({
        where: { sku: data.sku, isDeleted: false, id: { not: id } },
      });
      if (exists) {
        return NextResponse.json({ error: "رمز SKU مستخدم مسبقًا" }, { status: 409 });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        sku: data.sku ?? undefined,
        barcode: data.barcode ?? undefined,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("PUT /api/products/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.product.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/products/[id]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
