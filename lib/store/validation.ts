// Zod schemas for the /api/store routes. Kept out of the route files because
// Next.js route modules may only export HTTP handlers/config.

import { z } from "zod/v4";

const variantSchema = z.object({
  name: z.string(),
  sku: z.string().optional(),
  price: z.number().optional(),
  was: z.number().optional(),
  stockQty: z.number().default(0),
  image: z.string().optional(),
});

export const manualProductSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  nameAr: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  kind: z.enum(["physical", "digital"]).default("physical"),
  price: z.number().min(0, "السعر غير صالح"),
  was: z.number().optional(),
  currency: z.enum(["ILS", "USD"]).default("ILS"),
  stockQty: z.number().default(0),
  stockLabel: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  icon: z.string().optional(),
  images: z.array(z.string()).default([]),
  variants: z.array(variantSchema).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

/** Admin overrides for a synced product — all optional "final touches". */
export const overridesSchema = z.object({
  name: z.string().optional(),
  nameAr: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  price: z.number().optional(),
  was: z.number().optional(),
  currency: z.enum(["ILS", "USD"]).optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  image: z.string().optional(),
  images: z.array(z.string()).optional(),
  icon: z.string().optional(),
  stockLabel: z.string().optional(),
});

export const statusSchema = z.enum(["draft", "published", "archived"]);
