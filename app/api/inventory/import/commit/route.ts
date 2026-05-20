import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const schema = z.object({
  supplier: z.object({
    id: z.string().nullable().optional(),
    name: z.string().min(1, "اسم المورد مطلوب"),
    phone: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
  }),
  items: z
    .array(
      z.object({
        id: z.string().nullable().optional(),
        name: z.string().min(1),
        qty: z.coerce.number().int().min(1),
        unitCost: z.coerce.number().min(0),
        sku: z.string().nullable().optional(),
        sellPrice: z.coerce.number().min(0).optional(),
      })
    )
    .min(1, "يجب أن تحتوي الفاتورة على عنصر واحد على الأقل"),
  invoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return ok({ error: "بيانات غير صالحة", details: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve supplier — id wins, else phone match, else create
      let supplierId = data.supplier.id ?? null;
      const phone = data.supplier.phone?.trim() || null;
      if (!supplierId && phone) {
        const existing = await tx.supplier.findFirst({
          where: { phone, isDeleted: false },
          select: { id: true },
        });
        if (existing) supplierId = existing.id;
      }
      if (!supplierId) {
        const created = await tx.supplier.create({
          data: {
            name: data.supplier.name,
            phone,
            company: data.supplier.company ?? null,
          },
          select: { id: true },
        });
        supplierId = created.id;
      }

      const reference = data.invoiceNumber
        ? `استيراد ${data.invoiceNumber}`
        : "استيراد فاتورة شراء";
      const noteBase = data.invoiceDate
        ? `${reference} (${data.invoiceDate})`
        : reference;

      const createdProductIds: string[] = [];
      const stockedProductIds: string[] = [];
      let payableTotal = 0;

      // 2. For each item: match existing product (by id, then sku) or create new
      for (const item of data.items) {
        let productId: string | null = item.id ?? null;
        if (!productId && item.sku) {
          const found = await tx.product.findFirst({
            where: { sku: item.sku, isDeleted: false },
            select: { id: true },
          });
          if (found) productId = found.id;
        }

        if (!productId) {
          const created = await tx.product.create({
            data: {
              name: item.name,
              sku: item.sku?.trim() || null,
              costPrice: item.unitCost,
              sellPrice: item.sellPrice ?? item.unitCost,
              stockQty: item.qty,
              supplierId,
            },
            select: { id: true },
          });
          productId = created.id;
          createdProductIds.push(productId);
        } else {
          await tx.product.update({
            where: { id: productId },
            data: {
              stockQty: { increment: item.qty },
              costPrice: item.unitCost,
              ...(item.sellPrice ? { sellPrice: item.sellPrice } : {}),
              ...(item.id ? {} : { supplierId }),
            },
          });
          stockedProductIds.push(productId);
        }

        await tx.stockMovement.create({
          data: {
            productId,
            createdById: ctx.dbUser.id,
            type: "IN",
            qty: item.qty,
            note: noteBase,
            reference: data.invoiceNumber ?? undefined,
          },
        });

        payableTotal += item.qty * item.unitCost;
      }

      // 3. Record payable to the supplier
      const payable = await tx.payable.create({
        data: {
          supplierId,
          amount: payableTotal,
          currency: "ILS",
          reason: noteBase,
          status: "PENDING",
        },
        select: { id: true },
      });

      return { supplierId, payableId: payable.id, createdProductIds, stockedProductIds, payableTotal };
    });

    return ok(result, { status: 201 });
  } catch (e) {
    console.error("POST /api/inventory/import/commit", e);
    return ok({ error: "فشل حفظ الفاتورة" }, { status: 500 });
  }
}
