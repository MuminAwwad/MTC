// Orchestrates a store catalog sync: (file OR this system's products) →
// normalize → validate → upsert into the store's Neon DB. Ported from the
// storefront repo's lib/import/sync.ts.
//
// Approval-aware & idempotent:
//   • Products are matched by `externalId` (this system's Product id).
//   • NEW products are inserted as status "draft" (hidden from customers).
//   • EXISTING products have their source fields refreshed, but their review
//     status and admin overrides are left untouched — publishing and "final
//     touches" survive every re-sync.
//   • Each product's variants and images are replaced wholesale.
//   • "replace" mode deactivates synced products absent from this run.

import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { prisma } from "@/lib/prisma";
import { getStoreDb } from "./db";
import {
  storeCategories,
  storeImportRuns,
  storeProductImages,
  storeProducts,
  storeProductVariants,
} from "./schema";
import {
  normalizeRows,
  validateProducts,
  type NormalizedProduct,
  type RowError,
} from "./mapping";
import { parseInput, type ParseInput } from "./parse";

export type ImportSource = "upload" | "manual" | "source-db";

export interface ImportOptions {
  source: ImportSource;
  filename?: string;
  /** "replace" deactivates synced products missing from the run; "upsert" does not. */
  mode?: "upsert" | "replace";
}

export interface ImportReport {
  ok: boolean;
  format?: string;
  productsUpserted: number;
  variantsUpserted: number;
  imagesUpserted: number;
  categoriesUpserted: number;
  deactivated: number;
  skipped: number;
  errors: RowError[];
  durationMs: number;
  message?: string;
}

const money = (n: number | undefined): string | null => (n == null ? null : n.toFixed(2));

type Db = NonNullable<ReturnType<typeof getStoreDb>>;

interface PersistCounts {
  productsUpserted: number;
  variantsUpserted: number;
  imagesUpserted: number;
  categoriesUpserted: number;
  deactivated: number;
}

/** Upsert validated products + children inside one transaction. */
async function persist(
  db: Db,
  valid: NormalizedProduct[],
  mode: "upsert" | "replace",
): Promise<PersistCounts> {
  const categoryMap = new Map<string, string>();
  for (const p of valid) {
    if (p.categorySlug && p.categoryName) categoryMap.set(p.categorySlug, p.categoryName);
  }
  const externalIds = valid.map((p) => p.externalId);
  let productsUpserted = 0;
  let variantsUpserted = 0;
  let imagesUpserted = 0;
  let deactivated = 0;

  await db.transaction(async (tx) => {
    for (const [slug, name] of categoryMap) {
      await tx
        .insert(storeCategories)
        .values({ slug, name })
        .onConflictDoUpdate({ target: storeCategories.slug, set: { name } });
    }

    for (const p of valid) {
      // Source fields only — never written to status/overrides/createdAt.
      const sourceFields = {
        slug: p.slug,
        name: p.name,
        nameAr: p.nameAr ?? null,
        brand: p.brand ?? null,
        categorySlug: p.categorySlug ?? null,
        kind: p.kind,
        price: money(p.price)!,
        was: money(p.was),
        currency: p.currency,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold ?? 3,
        stockLabel: p.stockLabel ?? null,
        icon: p.icon ?? null,
        description: p.description ?? null,
        descriptionAr: p.descriptionAr ?? null,
        active: true,
        updatedAt: new Date(),
      };

      const [row] = await tx
        .insert(storeProducts)
        // New rows: status defaults to "draft", overrides stays null.
        .values({ externalId: p.externalId, ...sourceFields })
        .onConflictDoUpdate({ target: storeProducts.externalId, set: sourceFields })
        .returning({ id: storeProducts.id });
      productsUpserted++;
      const productId = row.id;

      await tx.delete(storeProductVariants).where(eq(storeProductVariants.productId, productId));
      await tx.delete(storeProductImages).where(eq(storeProductImages.productId, productId));

      if (p.variants.length) {
        await tx.insert(storeProductVariants).values(
          p.variants.map((v, i) => ({
            productId,
            externalId: v.externalId ?? null,
            sku: v.sku ?? null,
            name: v.name,
            options: v.options ?? null,
            price: money(v.price),
            was: money(v.was),
            stockQty: v.stockQty,
            image: v.image ?? null,
            sortOrder: i,
          })),
        );
        variantsUpserted += p.variants.length;
      }

      if (p.images.length) {
        await tx.insert(storeProductImages).values(
          p.images.map((url, i) => ({ productId, url, alt: p.name, sortOrder: i })),
        );
        imagesUpserted += p.images.length;
      }
    }

    if (mode === "replace" && externalIds.length) {
      // Only deactivate synced rows missing from this run. Manually-created
      // products are not part of the source, so they must be left alone.
      const deact = await tx
        .update(storeProducts)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(storeProducts.origin, "synced"),
            notInArray(storeProducts.externalId, externalIds),
          ),
        )
        .returning({ id: storeProducts.id });
      deactivated = deact.length;
    }
  });

  return {
    productsUpserted,
    variantsUpserted,
    imagesUpserted,
    categoriesUpserted: categoryMap.size,
    deactivated,
  };
}

const emptyReport = (): ImportReport => ({
  ok: false,
  productsUpserted: 0,
  variantsUpserted: 0,
  imagesUpserted: 0,
  categoriesUpserted: 0,
  deactivated: 0,
  skipped: 0,
  errors: [],
  durationMs: 0,
});

/** Shared tail: validate already-normalized products, persist, and audit. */
async function processRows(
  rows: Record<string, unknown>[],
  options: ImportOptions,
  start: number,
  format?: string,
): Promise<ImportReport> {
  const db = getStoreDb();
  if (!db) {
    return {
      ...emptyReport(),
      format,
      durationMs: Date.now() - start,
      message: "STORE_DATABASE_URL غير مضبوط — هيّئ قاعدة بيانات المتجر أولاً.",
    };
  }

  const { valid, errors } = validateProducts(normalizeRows(rows));
  const mode = options.mode ?? "upsert";

  let counts: PersistCounts;
  try {
    counts = await persist(db, valid, mode);
  } catch (err) {
    return {
      ...emptyReport(),
      format,
      errors,
      durationMs: Date.now() - start,
      message: `فشلت الكتابة إلى قاعدة بيانات المتجر: ${(err as Error).message}`,
    };
  }

  const report: ImportReport = {
    ok: true,
    format,
    ...counts,
    skipped: errors.length,
    errors,
    durationMs: Date.now() - start,
  };

  try {
    await db.insert(storeImportRuns).values({
      source: options.source,
      filename: options.filename ?? null,
      status: "ok",
      productsUpserted: counts.productsUpserted,
      variantsUpserted: counts.variantsUpserted,
      skipped: errors.length,
      report,
      durationMs: report.durationMs,
    });
  } catch {
    /* ignore audit write failures */
  }

  return report;
}

/** Import from an uploaded file (CSV / Excel / JSON). */
export async function runStoreImport(
  input: ParseInput,
  options: ImportOptions,
): Promise<ImportReport> {
  const start = Date.now();
  try {
    const { rows, format } = parseInput(input);
    return await processRows(rows, options, start, format);
  } catch (err) {
    return {
      ...emptyReport(),
      durationMs: Date.now() - start,
      message: `تعذّر قراءة الملف: ${(err as Error).message}`,
    };
  }
}

/**
 * Sync the store catalog from THIS system's products (the source of truth).
 * Replaces the old storefront-side `SOURCE_DATABASE_URL` pull: same shape,
 * same externalId (the Product cuid), same slugs — so it upserts cleanly over
 * rows created by previous syncs.
 */
export async function runManagementSync(
  ownerId: string,
  options: Omit<ImportOptions, "source"> & { source?: ImportSource } = {},
): Promise<ImportReport> {
  const start = Date.now();
  try {
    const products = await prisma.product.findMany({
      where: { ownerId, isDeleted: false },
      select: {
        id: true,
        name: true,
        description: true,
        sellPrice: true,
        stockQty: true,
        minStockQty: true,
        isActive: true,
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    // An empty read must not run in "replace" mode — it would deactivate the
    // store's entire synced catalog. Bail out loudly instead.
    if (products.length === 0) {
      return {
        ...emptyReport(),
        durationMs: Date.now() - start,
        message: "لا توجد منتجات في نظام الإدارة لهذا الحساب — أُلغيت المزامنة حمايةً لكتالوج المتجر.",
      };
    }

    // Shape rows like a flat export; alias-recognized headers keep this in
    // lock-step with how the storefront's own sync mapped the same data.
    const rows = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? "",
      brand: p.supplier?.name ?? "",
      price: String(Number(p.sellPrice)),
      stock: String(p.stockQty),
      low_stock_threshold: String(p.minStockQty),
      description: p.description ?? "",
      active: p.isActive ? "true" : "false",
      currency: "ILS",
    }));

    return await processRows(
      rows,
      { mode: "replace", ...options, source: options.source ?? "source-db" },
      start,
      "source-db",
    );
  } catch (err) {
    return {
      ...emptyReport(),
      durationMs: Date.now() - start,
      message: `تعذّرت قراءة منتجات نظام الإدارة: ${(err as Error).message}`,
    };
  }
}
