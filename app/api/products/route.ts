import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import prisma from "@/lib/prisma";
import { z } from "zod/v4";
import { ITEMS_PER_PAGE } from "@/lib/constants";

const schema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  unit: z.enum(["PIECE", "BOX", "SET", "METER", "OTHER"]).default("PIECE"),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  costPrice: z.coerce.number().min(0, "سعر التكلفة يجب أن يكون صفرًا أو أكثر"),
  sellPrice: z.coerce.number().min(0, "سعر البيع يجب أن يكون صفرًا أو أكثر"),
  stockQty: z.coerce.number().int().min(0).default(0),
  minStockQty: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const categoryId = searchParams.get("categoryId") ?? "";
    const lowStock = searchParams.get("lowStock") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = parseInt(searchParams.get("limit") ?? String(ITEMS_PER_PAGE));
    const all = searchParams.get("all") === "true";

    const where = {
      isDeleted: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
              { barcode: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId } : {}),
    };

    if (all) {
      const products = await prisma.product.findMany({
        where: { ...where, isActive: true },
        include: { category: true },
        orderBy: { name: "asc" },
      });
      return ok(products);
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          supplier: true,
          _count: { select: { invoiceItems: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    // Filter low stock in JS (cross-column comparison)
    const filtered = lowStock
      ? products.filter((p) => p.stockQty <= p.minStockQty)
      : products;

    // Low stock total count
    const allProducts = await prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      select: { stockQty: true, minStockQty: true },
    });
    const lowStockCount = allProducts.filter(
      (p) => p.stockQty <= p.minStockQty
    ).length;

    return ok({
      data: filtered,
      total: lowStock ? filtered.length : total,
      page,
      limit,
      totalPages: Math.ceil((lowStock ? filtered.length : total) / limit),
      lowStockCount,
    });
  } catch (error) {
    console.error("GET /api/products", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return ok(
        { error: "بيانات غير صالحة", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const normalizedSku = data.sku?.trim() || null;
    const normalizedBarcode = data.barcode?.trim() || null;

    if (normalizedSku) {
      const exists = await prisma.product.findFirst({
        where: { sku: normalizedSku, isDeleted: false },
        select: { id: true, name: true },
      });
      if (exists) {
        return ok(
          {
            error: `منتج بنفس رمز SKU موجود مسبقًا: ${exists.name}`,
            existingProductId: exists.id,
          },
          { status: 409 }
        );
      }
    }

    if (normalizedBarcode) {
      const exists = await prisma.product.findFirst({
        where: { barcode: normalizedBarcode, isDeleted: false },
        select: { id: true, name: true },
      });
      if (exists) {
        return ok(
          {
            error: `منتج بنفس الباركود موجود مسبقًا: ${exists.name}`,
            existingProductId: exists.id,
          },
          { status: 409 }
        );
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: data.name,
          sku: normalizedSku,
          barcode: normalizedBarcode,
          description: data.description || null,
          unit: data.unit,
          categoryId: data.categoryId || null,
          supplierId: data.supplierId || null,
          costPrice: data.costPrice,
          sellPrice: data.sellPrice,
          stockQty: data.stockQty,
          minStockQty: data.minStockQty,
          isActive: data.isActive,
        },
      });

      // Record initial stock if > 0
      if (data.stockQty > 0) {
        await tx.stockMovement.create({
          data: {
            productId: p.id,
            type: "IN",
            qty: data.stockQty,
            note: "رصيد افتتاحي",
          },
        });
      }

      return p;
    });

    return ok(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products", error);
    return ok({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
