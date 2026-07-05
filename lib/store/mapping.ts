// Column mapping for store catalog imports — ported from the storefront repo's
// lib/import/mapping.ts. Reduces raw rows (CSV/Excel/JSON/DB) to normalized
// products via case-insensitive column aliases, so export headers don't have
// to match exactly.
//
// VARIANTS are supported two ways:
//   • Flat files (CSV/Excel): rows sharing a `parent_id`/`group_id` value plus
//     a `variant` column become one product with many variants.
//   • JSON: a product object may carry nested `variants: [...]`/`images: [...]`.

import { z } from "zod/v4";
import { slugify, type ProductKind, type StoreCurrency } from "./types";

export interface NormalizedVariant {
  externalId?: string;
  sku?: string;
  name: string;
  options?: Record<string, string>;
  price?: number;
  was?: number;
  stockQty: number;
  image?: string;
}

export interface NormalizedProduct {
  externalId: string;
  slug: string;
  name: string;
  nameAr?: string;
  brand?: string;
  categorySlug?: string;
  categoryName?: string;
  kind: ProductKind;
  price: number;
  was?: number;
  currency: StoreCurrency;
  stockQty: number;
  lowStockThreshold?: number;
  stockLabel?: string;
  icon?: string;
  description?: string;
  descriptionAr?: string;
  active: boolean;
  images: string[];
  variants: NormalizedVariant[];
}

/** Accepted header names per canonical field (lowercase, _-separated). */
const ALIASES = {
  externalId: ["id", "product_id", "item_code", "code", "sku", "barcode"],
  name: ["name", "title", "product_name", "product", "item_name"],
  nameAr: ["name_ar", "arabic_name", "name_arabic", "title_ar"],
  brand: ["brand", "manufacturer", "make", "vendor"],
  category: ["category", "cat", "group_name", "department", "section"],
  kind: ["kind", "type", "product_type"],
  price: ["price", "unit_price", "sale_price", "selling_price", "retail_price"],
  was: ["was", "old_price", "compare_at", "compare_at_price", "list_price", "msrp"],
  currency: ["currency", "cur", "ccy"],
  stockQty: ["stock", "stock_qty", "quantity", "qty", "on_hand", "inventory", "available"],
  stockLabel: ["stock_label", "availability"],
  image: ["image", "image_url", "photo", "picture", "img", "thumbnail"],
  images: ["images", "gallery", "image_urls", "photos"],
  description: ["description", "desc", "details", "blurb", "summary"],
  descriptionAr: ["description_ar", "arabic_description", "desc_ar"],
  icon: ["icon"],
  active: ["active", "enabled", "published", "status", "visible"],
  lowStockThreshold: ["low_stock_threshold", "reorder_point"],
  // Variant grouping + per-variant fields (flat files):
  parent: ["parent", "parent_id", "parent_sku", "group_id", "group", "model"],
  variantName: ["variant", "variant_name", "option", "option_name", "variation"],
  variantOptions: ["variant_options", "options", "attributes"],
  variantSku: ["variant_sku", "sku"],
} as const;

type Row = Record<string, unknown>;

const normKey = (s: string) => s.toLowerCase().trim().replace(/[\s\-./]+/g, "_");

/** Re-key a raw row by normalized header names for alias lookups. */
function normalizeKeys(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[normKey(k)] = v;
  return out;
}

function pick(nrow: Row, field: keyof typeof ALIASES): string | undefined {
  for (const alias of ALIASES[field]) {
    const v = nrow[alias];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return undefined;
}

function toNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  // Tolerate "₪1,299.00", "$49.99", "1.299,00" → best-effort numeric.
  const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = Number(cleaned.replace(/,/g, "."));
  return Number.isFinite(n) ? n : undefined;
}

function toBool(v: string | undefined, fallback = true): boolean {
  if (v === undefined) return fallback;
  const s = v.toLowerCase();
  if (["false", "0", "no", "n", "draft", "inactive", "hidden", "disabled"].includes(s))
    return false;
  if (["true", "1", "yes", "y", "active", "published", "visible", "enabled"].includes(s))
    return true;
  return fallback;
}

function toKind(v: string | undefined): ProductKind {
  return v && /dig|virtual|license|key|software|download/i.test(v) ? "digital" : "physical";
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[|;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse `{"k":"v"}` JSON or `k:v;k2:v2` into an options map. */
function parseOptions(v: string | undefined): Record<string, string> | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(obj).map(([k, val]) => [k, String(val)]));
    } catch {
      /* fall through to k:v parsing */
    }
  }
  const out: Record<string, string> = {};
  for (const pair of trimmed.split(/[;|]/)) {
    const [k, ...rest] = pair.split(":");
    if (k && rest.length) out[k.trim()] = rest.join(":").trim();
  }
  return Object.keys(out).length ? out : undefined;
}

const variantSchema = z.object({
  externalId: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().min(1),
  options: z.record(z.string(), z.string()).optional(),
  price: z.number().nonnegative().optional(),
  was: z.number().nonnegative().optional(),
  stockQty: z.number().int(),
  image: z.string().optional(),
});

export const normalizedProductSchema = z.object({
  externalId: z.string().min(1, "missing product id"),
  slug: z.string().min(1),
  name: z.string().min(1, "missing name"),
  nameAr: z.string().optional(),
  brand: z.string().optional(),
  categorySlug: z.string().optional(),
  categoryName: z.string().optional(),
  kind: z.enum(["physical", "digital"]),
  price: z.number().nonnegative(),
  was: z.number().nonnegative().optional(),
  currency: z.enum(["ILS", "USD"]),
  stockQty: z.number().int(),
  lowStockThreshold: z.number().int().optional(),
  stockLabel: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  active: z.boolean(),
  images: z.array(z.string()),
  variants: z.array(variantSchema),
});

/** Build product-level fields from a (normalized) representative row. */
function baseProductFromRow(nrow: Row): Omit<NormalizedProduct, "variants"> {
  const name = pick(nrow, "name") ?? "";
  const externalId = pick(nrow, "externalId") ?? slugify(name);
  const kind = toKind(pick(nrow, "kind"));
  const currency = ((): StoreCurrency => {
    const c = pick(nrow, "currency")?.toUpperCase();
    if (c === "USD" || c === "ILS") return c;
    return kind === "digital" ? "USD" : "ILS";
  })();
  const categoryName = pick(nrow, "category");
  const image = pick(nrow, "image");
  const images = [
    ...new Set([image, ...splitList(pick(nrow, "images"))].filter(Boolean) as string[]),
  ];

  return {
    externalId,
    slug: slugify(pick(nrow, "name") ?? externalId),
    name,
    nameAr: pick(nrow, "nameAr"),
    brand: pick(nrow, "brand"),
    categoryName,
    categorySlug: categoryName ? slugify(categoryName) : undefined,
    kind,
    price: toNumber(pick(nrow, "price")) ?? 0,
    was: toNumber(pick(nrow, "was")),
    currency,
    stockQty: Math.trunc(toNumber(pick(nrow, "stockQty")) ?? 0),
    lowStockThreshold: toNumber(pick(nrow, "lowStockThreshold"))
      ? Math.trunc(toNumber(pick(nrow, "lowStockThreshold"))!)
      : undefined,
    stockLabel: pick(nrow, "stockLabel"),
    icon: pick(nrow, "icon"),
    description: pick(nrow, "description"),
    descriptionAr: pick(nrow, "descriptionAr"),
    active: toBool(pick(nrow, "active")),
    images,
  };
}

function variantFromRow(nrow: Row): NormalizedVariant | null {
  const name = pick(nrow, "variantName");
  if (!name) return null;
  return {
    externalId: pick(nrow, "externalId"),
    sku: pick(nrow, "variantSku"),
    name,
    options: parseOptions(pick(nrow, "variantOptions")),
    price: toNumber(pick(nrow, "price")),
    was: toNumber(pick(nrow, "was")),
    stockQty: Math.trunc(toNumber(pick(nrow, "stockQty")) ?? 0),
    image: pick(nrow, "image"),
  };
}

/**
 * Reduce raw rows to normalized products.
 * Flat rows are grouped by parent key; JSON rows may carry nested variants/images.
 */
export function normalizeRows(rows: Row[]): NormalizedProduct[] {
  const byKey = new Map<string, NormalizedProduct>();

  for (const raw of rows) {
    // JSON nested shape: a product object with variants/images arrays.
    if (Array.isArray(raw.variants) || Array.isArray((raw as Row).images)) {
      const nrow = normalizeKeys(raw);
      const base = baseProductFromRow(nrow);
      const nestedImages = Array.isArray((raw as Row).images)
        ? ((raw as Row).images as unknown[]).map((u) => String(u))
        : [];
      const nestedVariants = Array.isArray(raw.variants)
        ? (raw.variants as Row[]).map((v) => {
            const nv = normalizeKeys(v);
            return {
              externalId: pick(nv, "externalId"),
              sku: pick(nv, "variantSku") ?? pick(nv, "externalId"),
              name: pick(nv, "variantName") ?? pick(nv, "name") ?? "Default",
              options: parseOptions(pick(nv, "variantOptions")),
              price: toNumber(pick(nv, "price")),
              was: toNumber(pick(nv, "was")),
              stockQty: Math.trunc(toNumber(pick(nv, "stockQty")) ?? 0),
              image: pick(nv, "image"),
            } satisfies NormalizedVariant;
          })
        : [];
      byKey.set(base.externalId, {
        ...base,
        images: [...new Set([...base.images, ...nestedImages])],
        variants: nestedVariants,
      });
      continue;
    }

    // Flat shape: group rows by parent key (or the product id when ungrouped).
    const nrow = normalizeKeys(raw);
    const parentKey =
      pick(nrow, "parent") ?? pick(nrow, "externalId") ?? slugify(pick(nrow, "name") ?? "");
    const variant = variantFromRow(nrow);

    let product = byKey.get(parentKey);
    if (!product) {
      product = { ...baseProductFromRow(nrow), variants: [] };
      // When grouped under a parent, the parent value is the stable product id.
      if (pick(nrow, "parent")) product.externalId = parentKey;
      byKey.set(parentKey, product);
    } else {
      // Merge any extra images carried on subsequent rows.
      const extra = [pick(nrow, "image"), ...splitList(pick(nrow, "images"))].filter(
        Boolean,
      ) as string[];
      product.images = [...new Set([...product.images, ...extra])];
    }
    if (variant) product.variants.push(variant);
  }

  // Ensure unique slugs across the batch (append a short id when they collide).
  const seen = new Set<string>();
  for (const p of byKey.values()) {
    let slug = p.slug;
    if (seen.has(slug)) slug = `${slug}-${slugify(p.externalId)}`.slice(0, 90);
    seen.add(slug);
    p.slug = slug;
  }

  return [...byKey.values()];
}

export interface RowError {
  externalId?: string;
  name?: string;
  issues: string[];
}

/** Validate normalized products; returns the good ones and per-row errors. */
export function validateProducts(items: NormalizedProduct[]): {
  valid: NormalizedProduct[];
  errors: RowError[];
} {
  const valid: NormalizedProduct[] = [];
  const errors: RowError[] = [];
  for (const item of items) {
    const result = normalizedProductSchema.safeParse(item);
    if (result.success) valid.push(result.data);
    else
      errors.push({
        externalId: item.externalId,
        name: item.name,
        issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
  }
  return { valid, errors };
}
