// Write helpers for store products, ported from the storefront repo's
// lib/actions/products.ts. Two workflows:
//   • Synced products (origin "synced"): the source columns belong to this
//     system's sync; admin edits are saved as `overrides` + a review status.
//   • Manual products (origin "manual"): created here, values live in the
//     product's own columns, and syncs never touch them.
//
// Auth is the caller's job (the /api/store routes use withAuth); these helpers
// throw ApiError for user-facing failures.

import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { ApiError } from "@/lib/api-handler";
import { getStoreDb } from "./db";
import {
  storeCategories,
  storeProductImages,
  storeProducts,
  storeProductVariants,
} from "./schema";
import {
  slugify,
  type ManualProductInput,
  type ProductOverrides,
  type ProductStatus,
} from "./types";

type Db = NonNullable<ReturnType<typeof getStoreDb>>;

function requireStoreDb(): Db {
  const db = getStoreDb();
  if (!db) throw new ApiError("قاعدة بيانات المتجر غير مهيأة", 503);
  return db;
}

const money = (n: number | undefined): string | null =>
  n == null || Number.isNaN(n) ? null : n.toFixed(2);

/** A slug unique across products, derived from `base`, ignoring `exceptId`. */
async function uniqueSlug(db: Db, base: string, exceptId?: number): Promise<string> {
  const root = slugify(base);
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const clash = await db
      .select({ id: storeProducts.id })
      .from(storeProducts)
      .where(
        exceptId
          ? and(eq(storeProducts.slug, candidate), ne(storeProducts.id, exceptId))
          : eq(storeProducts.slug, candidate),
      )
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  // Extremely unlikely fallback: suffix with a timestamp.
  return `${root}-${Date.now()}`;
}

/** Ensure a category row exists for `name`, returning its slug (or null). */
async function ensureCategory(db: Db, name: string | undefined): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  await db
    .insert(storeCategories)
    .values({ slug, name: trimmed })
    .onConflictDoUpdate({ target: storeCategories.slug, set: { name: trimmed } });
  return slug;
}

/** Replace a manual product's gallery with the given ordered image URLs. */
async function replaceImages(db: Db, productId: number, urls: string[], alt: string) {
  await db.delete(storeProductImages).where(eq(storeProductImages.productId, productId));
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  if (clean.length) {
    await db
      .insert(storeProductImages)
      .values(clean.map((url, i) => ({ productId, url, alt, sortOrder: i })));
  }
}

/** Replace a manual product's variants with the given list (named rows only). */
async function replaceVariants(
  db: Db,
  productId: number,
  variants: ManualProductInput["variants"],
) {
  await db.delete(storeProductVariants).where(eq(storeProductVariants.productId, productId));
  const clean = variants.filter((v) => v.name?.trim());
  if (clean.length) {
    await db.insert(storeProductVariants).values(
      clean.map((v, i) => ({
        productId,
        name: v.name.trim(),
        sku: v.sku?.trim() || null,
        price: money(v.price),
        was: money(v.was),
        stockQty: Math.max(0, Math.trunc(v.stockQty || 0)),
        image: v.image?.trim() || null,
        sortOrder: i,
      })),
    );
  }
}

/** Map shared product columns from a manual input. */
function columnsFromInput(input: ManualProductInput, categorySlug: string | null) {
  return {
    name: input.name.trim(),
    nameAr: input.nameAr?.trim() || null,
    brand: input.brand?.trim() || null,
    categorySlug,
    kind: input.kind,
    price: money(input.price) ?? "0",
    was: money(input.was),
    currency: input.currency,
    stockQty: input.kind === "digital" ? 0 : Math.max(0, Math.trunc(input.stockQty || 0)),
    stockLabel: input.stockLabel?.trim() || null,
    icon: input.icon?.trim() || null,
    description: input.description?.trim() || null,
    descriptionAr: input.descriptionAr?.trim() || null,
    updatedAt: new Date(),
  };
}

function validateManualInput(input: ManualProductInput) {
  if (!input.name?.trim()) throw new ApiError("اسم المنتج مطلوب");
  if (!Number.isFinite(input.price) || input.price < 0) throw new ApiError("السعر غير صالح");
}

/** Save admin overrides and set the review status in one step (synced products). */
export async function saveStoreProductEdits(
  id: number,
  overrides: ProductOverrides,
  status: ProductStatus,
): Promise<void> {
  const db = requireStoreDb();
  const set: Partial<typeof storeProducts.$inferInsert> = {
    overrides: Object.keys(overrides).length ? overrides : null,
    status,
    updatedAt: new Date(),
  };
  if (status === "published") set.reviewedAt = new Date();
  await db.update(storeProducts).set(set).where(eq(storeProducts.id, id));
}

/** Change only the review status (publish / unpublish / archive). */
export async function setStoreProductStatus(id: number, status: ProductStatus): Promise<void> {
  const db = requireStoreDb();
  const set: Partial<typeof storeProducts.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };
  if (status === "published") set.reviewedAt = new Date();
  await db.update(storeProducts).set(set).where(eq(storeProducts.id, id));
}

/** Create a brand-new manual product. Returns its id + slug. */
export async function createStoreProduct(
  input: ManualProductInput,
): Promise<{ id: number; slug: string }> {
  const db = requireStoreDb();
  validateManualInput(input);
  const categorySlug = await ensureCategory(db, input.category);
  const slug = await uniqueSlug(db, input.name);
  const externalId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(storeProducts)
    .values({
      externalId,
      origin: "manual",
      slug,
      status: input.status,
      reviewedAt: input.status === "published" ? new Date() : null,
      active: true,
      ...columnsFromInput(input, categorySlug),
    })
    .returning({ id: storeProducts.id });
  await replaceImages(db, row.id, input.images, input.name.trim());
  await replaceVariants(db, row.id, input.variants ?? []);
  return { id: row.id, slug };
}

/** Update an existing manual product's columns, images, variants, and status. */
export async function updateStoreManualProduct(
  id: number,
  input: ManualProductInput,
): Promise<{ slug: string }> {
  const db = requireStoreDb();
  validateManualInput(input);
  const [existing] = await db
    .select({ origin: storeProducts.origin })
    .from(storeProducts)
    .where(eq(storeProducts.id, id))
    .limit(1);
  if (!existing) throw new ApiError("المنتج غير موجود", 404);
  if (existing.origin !== "manual")
    throw new ApiError("المنتجات المزامنة تُعدل عبر اللمسات النهائية (overrides)", 400);

  const categorySlug = await ensureCategory(db, input.category);
  const slug = await uniqueSlug(db, input.name, id);
  await db
    .update(storeProducts)
    .set({
      slug,
      status: input.status,
      reviewedAt: input.status === "published" ? new Date() : null,
      ...columnsFromInput(input, categorySlug),
    })
    .where(eq(storeProducts.id, id));
  await replaceImages(db, id, input.images, input.name.trim());
  await replaceVariants(db, id, input.variants ?? []);
  return { slug };
}

/** Permanently delete a manual product (cascades to its variants/images). */
export async function deleteStoreProduct(id: number): Promise<void> {
  const db = requireStoreDb();
  const [existing] = await db
    .select({ origin: storeProducts.origin })
    .from(storeProducts)
    .where(eq(storeProducts.id, id))
    .limit(1);
  if (!existing) throw new ApiError("المنتج غير موجود", 404);
  if (existing.origin !== "manual")
    throw new ApiError("المنتجات المزامنة تُؤرشف ولا تُحذف", 400);
  await db.delete(storeProducts).where(eq(storeProducts.id, id));
}
