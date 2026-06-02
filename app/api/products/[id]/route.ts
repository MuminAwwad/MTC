import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { withAuth, ApiError, parseBody } from "@/lib/api-handler";

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

export const GET = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
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
  if (!product) throw new ApiError("المنتج غير موجود", 404);
  return ok(product);
});

export const PUT = withAuth<{ id: string }>(async (req, ctx, { params }) => {
  const { id } = await params;
  const data = await parseBody(req, schema);
  const normalizedSku = data.sku?.trim() || null;
  const normalizedBarcode = data.barcode?.trim() || null;

  if (normalizedSku) {
    const exists = await prisma.product.findFirst({
      where: { ownerId: ctx.dbUser.id, sku: normalizedSku, isDeleted: false, NOT: { id } },
      select: { id: true, name: true },
    });
    if (exists) {
      return ok(
        { error: `منتج آخر بنفس رمز SKU موجود: ${exists.name}`, existingProductId: exists.id },
        { status: 409 }
      );
    }
  }

  if (normalizedBarcode) {
    const exists = await prisma.product.findFirst({
      where: { ownerId: ctx.dbUser.id, barcode: normalizedBarcode, isDeleted: false, NOT: { id } },
      select: { id: true, name: true },
    });
    if (exists) {
      return ok(
        { error: `منتج آخر بنفس الباركود موجود: ${exists.name}`, existingProductId: exists.id },
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
  if (result.count === 0) throw new ApiError("المنتج غير موجود", 404);

  const product = await prisma.product.findUnique({ where: { id } });
  return ok(product);
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, { params }) => {
  const { id } = await params;
  const result = await prisma.product.updateMany({
    where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
    data: { isDeleted: true, isActive: false },
  });
  if (result.count === 0) throw new ApiError("المنتج غير موجود", 404);
  return ok({ success: true });
});
