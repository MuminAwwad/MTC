import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type {
  DraftEnvelope,
  PurchaseInvoiceData,
  DebtsData,
  CustomersData,
  ProductsData,
} from "@/lib/chat-import";

export const dynamic = "force-dynamic";

// Server-side sanity check — the client posts back whatever envelope it
// received from /upload, so we re-validate to fail closed on tampering or
// stale data.
function isValidEnvelope(v: unknown): v is DraftEnvelope {
  if (!v || typeof v !== "object") return false;
  const env = v as Record<string, unknown>;
  switch (env.kind) {
    case "purchase_invoice":
      return env.data != null && Array.isArray((env.data as PurchaseInvoiceData).items);
    case "debts":
    case "customers":
    case "products":
      return env.data != null && Array.isArray((env.data as { rows: unknown[] }).rows);
    default:
      return false;
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const ownerId = ctx.dbUser.id;

  try {
    const body = await req.json();
    const env = body?.envelope as unknown;
    if (!isValidEnvelope(env)) {
      return ok({ error: "البيانات غير صالحة للاستيراد" }, { status: 400 });
    }

    switch (env.kind) {
      case "purchase_invoice":
        return ok(await commitPurchaseInvoice(ownerId, ctx.dbUser.id, env.data));
      case "debts":
        return ok(await commitDebts(ownerId, env.data));
      case "customers":
        return ok(await commitCustomers(ownerId, env.data));
      case "products":
        return ok(await commitProducts(ownerId, ctx.dbUser.id, env.data));
    }
  } catch (e) {
    console.error("POST /api/chat/commit", e);
    const detail = e instanceof Error ? e.message : String(e);
    return ok({ error: `فشل الاستيراد: ${detail}` }, { status: 500 });
  }
}

// ─── purchase invoice ───────────────────────────────────────────────────────
async function commitPurchaseInvoice(
  ownerId: string,
  userId: string,
  data: PurchaseInvoiceData
) {
  if (data.items.length === 0) {
    return { error: "لا توجد أصناف للاستيراد" };
  }

  const reference = data.invoiceNumber
    ? `استيراد ${data.invoiceNumber}`
    : "استيراد فاتورة شراء (المساعد الذكي)";
  const noteBase = data.invoiceDate ? `${reference} (${data.invoiceDate})` : reference;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Supplier — find by phone within shop, else create.
    let supplierId: string | null = null;
    const phone = data.supplier.phone?.trim() || null;
    if (phone) {
      const found = await tx.supplier.findFirst({
        where: { ownerId, phone, isDeleted: false },
        select: { id: true },
      });
      if (found) supplierId = found.id;
    }
    if (!supplierId) {
      const created = await tx.supplier.create({
        data: {
          ownerId,
          name: data.supplier.name ?? "مورد غير معروف",
          phone,
          company: data.supplier.company,
        },
        select: { id: true },
      });
      supplierId = created.id;
    }

    let created = 0;
    let restocked = 0;
    let payableTotal = 0;

    for (const item of data.items) {
      let productId: string | null = null;
      if (item.sku) {
        const found = await tx.product.findFirst({
          where: { ownerId, sku: item.sku, isDeleted: false },
          select: { id: true },
        });
        if (found) productId = found.id;
      }

      if (!productId) {
        const made = await tx.product.create({
          data: {
            ownerId,
            name: item.name,
            sku: item.sku,
            costPrice: item.unitCost,
            sellPrice: item.unitCost, // markup is a manual step later
            stockQty: item.qty,
            supplierId,
          },
          select: { id: true },
        });
        productId = made.id;
        created++;
      } else {
        await tx.product.update({
          where: { id: productId },
          data: {
            stockQty: { increment: item.qty },
            costPrice: item.unitCost,
          },
        });
        restocked++;
      }

      await tx.stockMovement.create({
        data: {
          ownerId,
          productId,
          createdById: userId,
          type: "IN",
          qty: item.qty,
          note: noteBase,
          reference: data.invoiceNumber ?? undefined,
        },
      });
      payableTotal += item.qty * item.unitCost;
    }

    const payable = await tx.payable.create({
      data: {
        ownerId,
        supplierId,
        amount: payableTotal,
        currency: data.currency,
        reason: noteBase,
        status: "PENDING",
      },
      select: { id: true },
    });

    return { supplierId, payableId: payable.id, created, restocked, payableTotal };
  });

  return {
    kind: "purchase_invoice" as const,
    summary: `أضيف ${result.created} منتج جديد، تم تجديد مخزون ${result.restocked} منتج، وفتح فاتورة مستحقة للمورد بقيمة ₪${result.payableTotal.toFixed(2)}.`,
    ...result,
  };
}

// ─── debts ──────────────────────────────────────────────────────────────────
async function commitDebts(ownerId: string, data: DebtsData) {
  if (data.rows.length === 0) return { error: "لا توجد صفوف للاستيراد" };

  const result = await prisma.$transaction(async (tx) => {
    let customersCreated = 0;
    let debtsCreated = 0;
    let totalILS = 0;

    for (const row of data.rows) {
      const phone = row.customerPhone?.trim() || null;
      let customerId: string | null = null;

      // Match existing customer by phone (the only per-shop-unique field).
      if (phone) {
        const found = await tx.customer.findFirst({
          where: { ownerId, phone, isDeleted: false },
          select: { id: true },
        });
        if (found) customerId = found.id;
      }
      // No phone? Try a case-insensitive exact-name match — best effort.
      if (!customerId) {
        const found = await tx.customer.findFirst({
          where: {
            ownerId,
            isDeleted: false,
            name: { equals: row.customerName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (found) customerId = found.id;
      }
      if (!customerId) {
        const made = await tx.customer.create({
          data: { ownerId, name: row.customerName, phone },
          select: { id: true },
        });
        customerId = made.id;
        customersCreated++;
      }

      await tx.debt.create({
        data: {
          ownerId,
          customerId,
          amount: row.amount,
          currency: "ILS",
          reason: row.notes ?? "استيراد من المساعد الذكي",
          status: "PENDING",
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
          notes: row.notes,
        },
      });
      debtsCreated++;
      totalILS += row.amount;
    }

    return { customersCreated, debtsCreated, totalILS };
  });

  return {
    kind: "debts" as const,
    summary: `أضيف ${result.debtsCreated} دين${result.customersCreated > 0 ? `، منهم ${result.customersCreated} عميل جديد` : ""}، بإجمالي ₪${result.totalILS.toFixed(2)}.`,
    ...result,
  };
}

// ─── customers ──────────────────────────────────────────────────────────────
async function commitCustomers(ownerId: string, data: CustomersData) {
  if (data.rows.length === 0) return { error: "لا توجد عملاء للاستيراد" };

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let skipped = 0;

    for (const row of data.rows) {
      const phone = row.phone?.trim() || null;
      // Skip if phone already exists in this shop.
      if (phone) {
        const dup = await tx.customer.findFirst({
          where: { ownerId, phone, isDeleted: false },
          select: { id: true },
        });
        if (dup) {
          skipped++;
          continue;
        }
      }
      await tx.customer.create({
        data: {
          ownerId,
          name: row.name,
          phone,
          address: row.address,
          notes: row.notes,
        },
      });
      created++;
    }

    return { created, skipped };
  });

  return {
    kind: "customers" as const,
    summary: `أضيف ${result.created} عميل جديد${result.skipped > 0 ? `، وتم تجاوز ${result.skipped} عميل لوجود رقم هاتفه مسبقًا` : ""}.`,
    ...result,
  };
}

// ─── products ───────────────────────────────────────────────────────────────
async function commitProducts(ownerId: string, userId: string, data: ProductsData) {
  if (data.rows.length === 0) return { error: "لا توجد منتجات للاستيراد" };

  const result = await prisma.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;

    // Map of (lowercased) category name → id, populated lazily.
    const catCache = new Map<string, string>();
    const getCategoryId = async (name: string | null): Promise<string | null> => {
      if (!name) return null;
      const key = name.toLowerCase();
      if (catCache.has(key)) return catCache.get(key)!;
      const existing = await tx.category.findFirst({
        where: { ownerId, name: { equals: name, mode: "insensitive" }, isDeleted: false },
        select: { id: true },
      });
      if (existing) {
        catCache.set(key, existing.id);
        return existing.id;
      }
      const slug =
        name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9؀-ۿ-]/g, "").slice(0, 40) +
        "-" +
        Date.now();
      const made = await tx.category.create({
        data: { ownerId, name, slug },
        select: { id: true },
      });
      catCache.set(key, made.id);
      return made.id;
    };

    for (const row of data.rows) {
      const categoryId = await getCategoryId(row.categoryName);

      // Match existing by sku if present.
      let existingId: string | null = null;
      if (row.sku) {
        const found = await tx.product.findFirst({
          where: { ownerId, sku: row.sku, isDeleted: false },
          select: { id: true },
        });
        if (found) existingId = found.id;
      }

      if (existingId) {
        await tx.product.update({
          where: { id: existingId },
          data: {
            costPrice: row.costPrice ?? undefined,
            sellPrice: row.sellPrice,
            stockQty: { increment: row.stockQty },
            ...(row.minStockQty != null ? { minStockQty: row.minStockQty } : {}),
            ...(categoryId ? { categoryId } : {}),
          },
        });
        if (row.stockQty > 0) {
          await tx.stockMovement.create({
            data: {
              ownerId,
              productId: existingId,
              createdById: userId,
              type: "IN",
              qty: row.stockQty,
              note: "استيراد من المساعد الذكي",
            },
          });
        }
        updated++;
      } else {
        const made = await tx.product.create({
          data: {
            ownerId,
            name: row.name,
            sku: row.sku,
            barcode: row.barcode,
            costPrice: row.costPrice ?? row.sellPrice,
            sellPrice: row.sellPrice,
            stockQty: row.stockQty,
            minStockQty: row.minStockQty ?? 0,
            categoryId,
          },
          select: { id: true },
        });
        if (row.stockQty > 0) {
          await tx.stockMovement.create({
            data: {
              ownerId,
              productId: made.id,
              createdById: userId,
              type: "IN",
              qty: row.stockQty,
              note: "استيراد من المساعد الذكي — رصيد افتتاحي",
            },
          });
        }
        created++;
      }
    }

    return { created, updated };
  });

  return {
    kind: "products" as const,
    summary: `أضيف ${result.created} منتج جديد${result.updated > 0 ? `، وحُدِّث ${result.updated} منتج موجود` : ""}.`,
    ...result,
  };
}
