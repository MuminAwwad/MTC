import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? "";
    const type = searchParams.get("type") ?? "";
    const productId = searchParams.get("productId") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = parseInt(searchParams.get("limit") ?? String(ITEMS_PER_PAGE));

    const where = {
      ...(search
        ? { product: { name: { contains: search, mode: "insensitive" as const } } }
        : {}),
      ...(type ? { type: type as "IN" | "OUT" | "ADJUSTMENT" } : {}),
      ...(productId ? { productId } : {}),
    };

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return NextResponse.json({
      data: movements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("GET /api/inventory/movements", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
