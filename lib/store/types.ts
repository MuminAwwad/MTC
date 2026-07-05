// Types shared with the e-commerce storefront (MTC-E-Commerce repo).
//
// These mirror the storefront's lib/data.ts and lib/content/types.ts. The two
// codebases talk through the store's Neon Postgres database, so these shapes
// (especially the jsonb payloads: ProductOverrides, PageLayout, SiteConfig)
// must stay wire-compatible with what the storefront reads. If a field is
// added there, add it here too.

export type StoreCurrency = "ILS" | "USD";
export type ProductKind = "physical" | "digital";
export type StockStatus = "in" | "low" | "out";
export type ProductStatus = "draft" | "published" | "archived";
export type ProductOrigin = "synced" | "manual";

/** Derive the storefront stock badge from a quantity. */
export function stockStatus(qty: number, lowThreshold = 3): StockStatus {
  if (qty <= 0) return "out";
  if (qty <= lowThreshold) return "low";
  return "in";
}

/** Admin "final touches" applied over the synced data; survives re-syncs. */
export interface ProductOverrides {
  name?: string;
  nameAr?: string;
  brand?: string;
  category?: string;
  price?: number;
  was?: number;
  currency?: StoreCurrency;
  description?: string;
  descriptionAr?: string;
  image?: string;
  images?: string[];
  icon?: string;
  stockLabel?: string;
}

/** Variant input for products created/edited directly in the admin. */
export interface ManualVariantInput {
  /** Display label, e.g. "256GB / Black". */
  name: string;
  sku?: string;
  /** Empty inherits the product price. */
  price?: number;
  was?: number;
  stockQty: number;
  image?: string;
}

/** Fields for a product created or edited directly in the admin (not synced). */
export interface ManualProductInput {
  name: string;
  nameAr?: string;
  brand?: string;
  /** Category display name; the API slugifies it and creates it if new. */
  category?: string;
  kind: ProductKind;
  price: number;
  was?: number;
  currency: StoreCurrency;
  stockQty: number;
  stockLabel?: string;
  description?: string;
  descriptionAr?: string;
  icon?: string;
  /** Gallery image URLs; the first entry is the primary image. */
  images: string[];
  /** Buyable options (size/color/…); empty for a simple product. */
  variants: ManualVariantInput[];
  status: ProductStatus;
}

/** URL-safe slug from a product/category name (mirrors the storefront's slugify). */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}

// ── Storefront Content Studio ──────────────────────────────────────────────

/** A localized string: English + Arabic. Empty values fall back to i18n defaults. */
export interface LocalizedText {
  en: string;
  ar: string;
}

/** Per-section appearance overrides (background, spacing, alignment, width). */
export interface SectionAppearance {
  background?: "default" | "surface" | "muted" | "dark" | "navy" | "primary" | "custom";
  /** Custom background color (hex) when background === "custom". */
  bgColor?: string;
  paddingTop?: "none" | "sm" | "md" | "lg" | "xl";
  paddingBottom?: "none" | "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end";
  maxWidth?: "normal" | "wide" | "full";
}

/** One placed section in a page layout. */
export interface SectionInstance {
  /** Stable per-instance id, used as React key + select target. */
  id: string;
  /** Section type — a key in the storefront's section registry. */
  type: string;
  /** When false, the section is hidden on the storefront but kept in the layout. */
  visible: boolean;
  /** Type-specific settings; shape is defined by the section descriptor's fields. */
  settings: Record<string, unknown>;
  appearance?: SectionAppearance;
}

/** An ordered list of sections = one page's content. */
export type PageLayout = SectionInstance[];

/** Site-wide brand/theme overrides, injected as CSS variables on the storefront. */
export interface SiteTheme {
  brandColor?: string;
  accentColor?: string;
  corners?: "sharp" | "rounded" | "pill";
}

/** A navigation / footer link with a localized label. */
export interface NavLink {
  labelEn: string;
  labelAr: string;
  href: string;
  /** Header items only: show the "new" accent dot. */
  dot?: boolean;
}

/** A titled group of links in the footer. */
export interface FooterColumn {
  titleEn: string;
  titleAr: string;
  links: NavLink[];
}

/** A footer social link (icon chosen from a small known set). */
export interface SocialLink {
  /** One of: whatsapp, instagram, facebook, x, tiktok, youtube, link. */
  platform: string;
  href: string;
}

/** Global, cross-page storefront content: header, footer, announcement, theme. */
export interface SiteConfig {
  announcement: {
    enabled: boolean;
    text: LocalizedText;
    href?: string;
  };
  header?: {
    deliveryText?: LocalizedText;
    nav?: NavLink[];
  };
  footer: {
    tagline: LocalizedText;
    columns?: FooterColumn[];
    social?: SocialLink[];
    copyright?: LocalizedText;
  };
  theme?: SiteTheme;
}
