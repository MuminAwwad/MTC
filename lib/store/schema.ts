// Drizzle schema for the e-commerce storefront's Neon Postgres database.
//
// This is a copy of the storefront repo's lib/db/schema.ts (MTC-E-Commerce).
// The store's DB layout is owned by that repo — its migrations created these
// tables, and its sync cron writes the catalog rows. This project connects as
// a second client to manage the admin-owned fields (status, overrides, CMS
// content). Keep this file in sync with the storefront's schema; never run
// migrations against the store DB from here.

import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PageLayout, ProductOverrides, SiteConfig } from "./types";

/** Top-level catalog categories (Laptops, Phones, …). */
export const storeCategories = pgTable("categories", {
  id: serial("id").primaryKey(),
  /** Stable id from the management system, if it has one. */
  externalId: text("external_id"),
  /** URL-safe key used in routes and as a foreign key target. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  image: text("image"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** A sellable product. Simple products use the base price/stock here; products
 *  with options additionally have rows in `storeProductVariants`. */
export const storeProducts = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    /** Stable id / item code from the management system. Upsert key. */
    externalId: text("external_id").notNull(),
    /** "synced" rows are owned by the management system and refreshed by syncs;
     *  "manual" rows are created in the admin and never touched by a sync. */
    origin: text("origin", { enum: ["synced", "manual"] })
      .notNull()
      .default("synced"),
    /** URL-safe key, derived from name/code if the source has none. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    brand: text("brand"),
    /** References categories.slug (kept loose so an unknown category still imports). */
    categorySlug: text("category_slug"),
    /** "physical" ships and carries stock; "digital" is delivered instantly. */
    kind: text("kind", { enum: ["physical", "digital"] })
      .notNull()
      .default("physical"),

    // Pricing — money is stored as exact numeric and converted to Number on read.
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    was: numeric("was", { precision: 12, scale: 2 }),
    currency: text("currency", { enum: ["ILS", "USD"] })
      .notNull()
      .default("ILS"),

    // Inventory — the source quantity; the storefront derives in/low/out from it.
    stockQty: integer("stock_qty").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(3),
    /** Optional human override, e.g. "2 left". */
    stockLabel: text("stock_label"),

    /** Material Symbols icon name for digital products without a photo. */
    icon: text("icon"),
    description: text("description"),
    descriptionAr: text("description_ar"),

    /** Present in the latest source sync (false = removed upstream). */
    active: boolean("active").notNull().default(true),

    // ── Approval workflow ────────────────────────────────────────────────
    /** Review state. New synced products arrive as "draft"; only "published"
     *  is visible to customers. Never reset by a sync. */
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    /** Admin "final touches" applied over the synced data; survives re-syncs. */
    overrides: jsonb("overrides").$type<ProductOverrides>(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_external_id_uq").on(t.externalId),
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_category_idx").on(t.categorySlug),
    index("products_kind_idx").on(t.kind),
    index("products_status_idx").on(t.status),
  ],
);

/** A specific buyable option of a product (e.g. "256GB / Black"). */
export const storeProductVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => storeProducts.id, { onDelete: "cascade" }),
    /** Stable id from the management system for this variant. */
    externalId: text("external_id"),
    sku: text("sku"),
    /** Display label for the option, e.g. "256GB / Black". */
    name: text("name").notNull(),
    /** Free-form option map, e.g. { storage: "256GB", color: "Black" }. */
    options: jsonb("options").$type<Record<string, string>>(),
    /** Null price means "inherit the product's price". */
    price: numeric("price", { precision: 12, scale: 2 }),
    was: numeric("was", { precision: 12, scale: 2 }),
    stockQty: integer("stock_qty").notNull().default(0),
    image: text("image"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    index("variants_external_id_idx").on(t.externalId),
  ],
);

/** Ordered gallery photos for a product. */
export const storeProductImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => storeProducts.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("images_product_idx").on(t.productId)],
);

/** Audit row written after every sync, so the admin can see import history. */
export const storeImportRuns = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // "upload" | "scheduled" | "cli"
  filename: text("filename"),
  status: text("status").notNull(), // "ok" | "error"
  productsUpserted: integer("products_upserted").notNull().default(0),
  variantsUpserted: integer("variants_upserted").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  report: jsonb("report"),
  durationMs: doublePrecision("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Storefront Content Studio ──────────────────────────────────────────────
// Admin-editable storefront content. Unlike the catalog tables above, these are
// NOT synced from the management system — they are the storefront's own CMS data.

/** A storefront page (home, custom pages). Layout is a JSON document of sections,
 *  with separate draft + published copies for atomic publishing. */
export const storePages = pgTable("pages", {
  id: serial("id").primaryKey(),
  /** URL key: "home" for the homepage, or the path segment for custom pages. */
  slug: text("slug").notNull().unique(),
  /** "system" pages (home, …) can't be deleted; "custom" pages are admin-created. */
  kind: text("kind", { enum: ["system", "custom"] }).notNull().default("custom"),
  titleEn: text("title_en"),
  titleAr: text("title_ar"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  publishedLayout: jsonb("published_layout").$type<PageLayout>(),
  draftLayout: jsonb("draft_layout").$type<PageLayout>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Singleton row of global content (header announcement bar, footer). */
export const storeSiteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  publishedConfig: jsonb("published_config").$type<SiteConfig>(),
  draftConfig: jsonb("draft_config").$type<SiteConfig>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uploaded images (Vercel Blob), surfaced as a simple media library in the editor. */
export const storeMediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  pathname: text("pathname"),
  contentType: text("content_type"),
  size: integer("size"),
  altEn: text("alt_en"),
  altAr: text("alt_ar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StoreCategoryRow = typeof storeCategories.$inferSelect;
export type StoreProductRow = typeof storeProducts.$inferSelect;
export type StoreVariantRow = typeof storeProductVariants.$inferSelect;
export type StoreImageRow = typeof storeProductImages.$inferSelect;
export type StoreImportRunRow = typeof storeImportRuns.$inferSelect;
export type StorePageRow = typeof storePages.$inferSelect;
export type StoreSiteSettingsRow = typeof storeSiteSettings.$inferSelect;
export type StoreMediaAssetRow = typeof storeMediaAssets.$inferSelect;
