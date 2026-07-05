// Read helpers for the store admin section, ported from the storefront repo's
// lib/catalog.ts (admin half). Unlike the storefront, there is no seed
// fallback here: this is a management tool, so a missing/unreachable store DB
// surfaces as an explicit "not configured" state, never sample data.

import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getStoreDb } from "./db";
import {
  storeCategories,
  storeImportRuns,
  storeProductImages,
  storeProducts,
  storeProductVariants,
  type StoreImportRunRow,
} from "./schema";
import {
  stockStatus,
  type StoreCurrency,
  type ProductKind,
  type ProductOrigin,
  type ProductOverrides,
  type ProductStatus,
  type StockStatus,
} from "./types";

const toNum = (v: string | null): number | undefined =>
  v == null ? undefined : Number(v);

export interface StoreAdminProduct {
  id: string;
  externalId: string;
  slug: string;
  name: string;
  category: string;
  kind: ProductKind;
  price: number;
  currency: StoreCurrency;
  stockQty: number;
  stock: StockStatus;
  active: boolean;
  status: ProductStatus;
  origin: ProductOrigin;
  /** True when the admin saved overrides on top of the synced data. */
  edited: boolean;
  image?: string;
  icon?: string;
  variantCount: number;
}

/** All products (including inactive) for the admin list. */
export async function getStoreAdminProducts(): Promise<StoreAdminProduct[]> {
  const db = getStoreDb();
  if (!db) return [];
  const rows = await db.select().from(storeProducts).orderBy(asc(storeProducts.name));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [variantCounts, imgs, cats] = await Promise.all([
    db
      .select({
        productId: storeProductVariants.productId,
        count: sql<number>`count(*)::int`,
      })
      .from(storeProductVariants)
      .where(inArray(storeProductVariants.productId, ids))
      .groupBy(storeProductVariants.productId),
    db
      .select({
        productId: storeProductImages.productId,
        url: storeProductImages.url,
        sortOrder: storeProductImages.sortOrder,
      })
      .from(storeProductImages)
      .where(inArray(storeProductImages.productId, ids)),
    db.select().from(storeCategories),
  ]);

  const countByProduct = new Map(variantCounts.map((v) => [v.productId, Number(v.count)]));
  const firstImage = new Map<number, string>();
  for (const im of [...imgs].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!firstImage.has(im.productId)) firstImage.set(im.productId, im.url);
  }
  const categoryName = new Map(cats.map((c) => [c.slug, c.name] as const));

  return rows.map((p) => {
    const o: ProductOverrides = p.overrides ?? {};
    return {
      id: String(p.id),
      externalId: p.externalId,
      slug: p.slug,
      // Show the effective (overridden) values the customer would see.
      name: o.name ?? p.name,
      category:
        o.category ??
        ((p.categorySlug && categoryName.get(p.categorySlug)) || p.categorySlug || "—"),
      kind: p.kind,
      price: o.price ?? Number(p.price),
      currency: o.currency ?? p.currency,
      stockQty: p.stockQty,
      stock: stockStatus(p.stockQty, p.lowStockThreshold),
      active: p.active,
      status: p.status,
      origin: p.origin,
      edited: Boolean(p.overrides && Object.keys(p.overrides).length > 0),
      image: o.image ?? firstImage.get(p.id),
      icon: o.icon ?? p.icon ?? undefined,
      variantCount: countByProduct.get(p.id) ?? 0,
    };
  });
}

export interface StoreAdminProductDetail {
  id: string;
  externalId: string;
  slug: string;
  status: ProductStatus;
  active: boolean;
  /** "manual" products are edited directly; "synced" use the override workflow. */
  origin: ProductOrigin;
  reviewedAt?: string;
  variantCount: number;
  /** Raw values from the management system (what a sync writes). */
  source: {
    name: string;
    nameAr?: string;
    brand?: string;
    category?: string;
    kind: ProductKind;
    price: number;
    was?: number;
    currency: StoreCurrency;
    stockQty: number;
    description?: string;
    descriptionAr?: string;
    image?: string;
    images: string[];
    icon?: string;
    stockLabel?: string;
  };
  /** Admin's saved overrides. */
  overrides: ProductOverrides;
  /** Variant rows (used when editing a manual product). */
  variants: {
    name: string;
    sku?: string;
    price?: number;
    was?: number;
    stockQty: number;
    image?: string;
  }[];
}

/** Full detail for the admin edit screen (source values + overrides + status). */
export async function getStoreAdminProductById(
  id: string,
): Promise<StoreAdminProductDetail | undefined> {
  const db = getStoreDb();
  const numericId = Number(id);
  if (!db || !Number.isInteger(numericId)) return undefined;

  const [p] = await db
    .select()
    .from(storeProducts)
    .where(eq(storeProducts.id, numericId))
    .limit(1);
  if (!p) return undefined;

  const [imgs, cats, vrows] = await Promise.all([
    db.select().from(storeProductImages).where(eq(storeProductImages.productId, p.id)),
    db.select().from(storeCategories),
    db.select().from(storeProductVariants).where(eq(storeProductVariants.productId, p.id)),
  ]);
  const gallery = [...imgs].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url);
  const categoryName = new Map(cats.map((c) => [c.slug, c.name] as const));
  const variants = [...vrows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      name: v.name,
      sku: v.sku ?? undefined,
      price: toNum(v.price),
      was: toNum(v.was),
      stockQty: v.stockQty,
      image: v.image ?? undefined,
    }));

  return {
    id: String(p.id),
    externalId: p.externalId,
    slug: p.slug,
    status: p.status,
    active: p.active,
    origin: p.origin,
    reviewedAt: p.reviewedAt?.toISOString(),
    variantCount: variants.length,
    source: {
      name: p.name,
      nameAr: p.nameAr ?? undefined,
      brand: p.brand ?? undefined,
      category:
        (p.categorySlug && categoryName.get(p.categorySlug)) || p.categorySlug || undefined,
      kind: p.kind,
      price: Number(p.price),
      was: toNum(p.was),
      currency: p.currency,
      stockQty: p.stockQty,
      description: p.description ?? undefined,
      descriptionAr: p.descriptionAr ?? undefined,
      image: gallery[0],
      images: gallery,
      icon: p.icon ?? undefined,
      stockLabel: p.stockLabel ?? undefined,
    },
    overrides: p.overrides ?? {},
    variants,
  };
}

/** Recent sync/import audit rows, newest first. */
export async function getStoreImportRuns(limit = 20): Promise<StoreImportRunRow[]> {
  const db = getStoreDb();
  if (!db) return [];
  return db
    .select()
    .from(storeImportRuns)
    .orderBy(sql`${storeImportRuns.createdAt} desc`)
    .limit(limit);
}
