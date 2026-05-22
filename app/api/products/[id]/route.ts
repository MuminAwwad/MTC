import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { requireUser } from "@/lib/auth";

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
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
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
      return ok({ error: "المنتج غير موجود" }, { status: 404 });
    }

    return ok(product);
  } catch (error) {
    console.error("GET /api/products/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return ok({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const data = parsed.data;
    const normalizedSku = data.sku?.trim() || null;
    const normalizedBarcode = data.barcode?.trim() || null;

    if (normalizedSku) {
      const exists = await prisma.product.findFirst({
        where: {
          ownerId: ctx.dbUser.id,
          sku: normalizedSku,
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (exists) {
        return ok(
          {
            error: `منتج آخر بنفس رمز SKU موجود: ${exists.name}`,
            existingProductId: exists.id,
          },
          { status: 409 }
        );
      }
    }

    if (normalizedBarcode) {
      const exists = await prisma.product.findFirst({
        where: {
          ownerId: ctx.dbUser.id,
          barcode: normalizedBarcode,
          isDeleted: false,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (exists) {
        return ok(
          {
            error: `منتج آخر بنفس الباركود موجود: ${exists.name}`,
            existingProductId: exists.id,
          },
          { status: 409 }
        );
      }
    }

    const result = await prisma.product.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: {
        ...data,
        sku: data.sku === undefined ? undefined : normalizedSku,
        barcode: data.barcode === undefined ? undefined : normalizedBarcode,
      },
    });

    if (result.count === 0) {
      return ok({ error: "المنتج غير موجود" }, { status: 404 });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    return ok(product);
  } catch (error) {
    console.error("PUT /api/products/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const result = await prisma.product.updateMany({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      data: { isDeleted: true, isActive: false },
    });
    if (result.count === 0) {
      return ok({ error: "المنتج غير موجود" }, { status: 404 });
    }

    return ok({ success: true });
  } catch (error) {
    console.error("DELETE /api/products/[id]", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
