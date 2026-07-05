// Storefront Content Studio data layer — ported from the storefront repo's
// lib/content/index.ts + lib/actions/content.ts. Reads and writes the store
// DB's CMS tables (pages, site_settings). Draft/publish semantics:
//   • Every edit saves into the draft slot (invisible to customers).
//   • Publishing copies the draft into the published slot atomically.
//   • The storefront serves only published layouts/config.

import "server-only";
import { eq } from "drizzle-orm";
import { ApiError } from "@/lib/api-handler";
import { getStoreDb } from "./db";
import { storePages, storeSiteSettings, type StorePageRow } from "./schema";
import { slugify, type PageLayout, type SiteConfig } from "./types";

/** Paths that already belong to the storefront and can't be custom pages. */
const RESERVED_SLUGS = new Set([
  "home", "catalog", "cart", "account", "repair", "products", "product",
  "admin", "api", "login", "checkout", "order-confirmation",
]);

/** Slugs that ship with the storefront and can't be deleted. */
const SYSTEM_SLUGS = new Set(["home"]);

type Db = NonNullable<ReturnType<typeof getStoreDb>>;

function requireStoreDb(): Db {
  const db = getStoreDb();
  if (!db) throw new ApiError("قاعدة بيانات المتجر غير مهيأة", 503);
  return db;
}

export interface StorePageSummary {
  slug: string;
  kind: "system" | "custom";
  titleEn: string | null;
  titleAr: string | null;
  status: "draft" | "published";
  updatedAt: string | null;
}

/** Built-in pages that always exist even without a DB row. */
const SYSTEM_PAGES: StorePageSummary[] = [
  {
    slug: "home",
    kind: "system",
    titleEn: "Home",
    titleAr: "الصفحة الرئيسية",
    status: "published",
    updatedAt: null,
  },
];

/** All pages for the admin list: system pages merged with DB rows. */
export async function listStorePages(): Promise<StorePageSummary[]> {
  const db = getStoreDb();
  const bySlug = new Map<string, StorePageSummary>(SYSTEM_PAGES.map((p) => [p.slug, p]));
  if (db) {
    const rows = await db.select().from(storePages);
    for (const r of rows) {
      bySlug.set(r.slug, {
        slug: r.slug,
        kind: r.kind,
        titleEn: r.titleEn,
        titleAr: r.titleAr,
        status: r.status,
        updatedAt: r.updatedAt?.toISOString() ?? null,
      });
    }
  }
  return [...bySlug.values()];
}

export interface StorePageEditorData {
  slug: string;
  kind: "system" | "custom";
  titleEn: string | null;
  titleAr: string | null;
  status: "draft" | "published";
  /** The working layout: draft when present, else published, else empty. */
  layout: PageLayout;
  hasUnpublishedDraft: boolean;
}

/** Load a page for the editor (the draft layout is the working copy). */
export async function getStorePageForEditor(slug: string): Promise<StorePageEditorData | null> {
  const db = requireStoreDb();
  const [row] = await db.select().from(storePages).where(eq(storePages.slug, slug)).limit(1);
  if (!row) {
    const sys = SYSTEM_PAGES.find((p) => p.slug === slug);
    if (!sys) return null;
    return { ...sys, layout: [], hasUnpublishedDraft: false };
  }
  const layout = row.draftLayout ?? row.publishedLayout ?? [];
  return {
    slug: row.slug,
    kind: row.kind,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    status: row.status,
    layout,
    hasUnpublishedDraft:
      row.draftLayout != null &&
      JSON.stringify(row.draftLayout) !== JSON.stringify(row.publishedLayout),
  };
}

/** Fetch the page row, creating it (as draft) on first edit. */
async function ensureRow(db: Db, slug: string): Promise<StorePageRow> {
  const [row] = await db.select().from(storePages).where(eq(storePages.slug, slug)).limit(1);
  if (row) return row;
  const kind = SYSTEM_SLUGS.has(slug) ? "system" : "custom";
  const [created] = await db
    .insert(storePages)
    .values({ slug, kind, status: "draft" })
    .returning();
  return created;
}

/** Persist the working layout as the page's draft (not yet visible to customers). */
export async function saveDraftLayout(slug: string, layout: PageLayout): Promise<void> {
  const db = requireStoreDb();
  await ensureRow(db, slug);
  await db
    .update(storePages)
    .set({ draftLayout: layout, updatedAt: new Date() })
    .where(eq(storePages.slug, slug));
}

/** Publish the working layout: copy it into the published slot and mark published. */
export async function publishPage(slug: string, layout: PageLayout): Promise<void> {
  const db = requireStoreDb();
  await ensureRow(db, slug);
  await db
    .update(storePages)
    .set({
      draftLayout: layout,
      publishedLayout: layout,
      status: "published",
      updatedAt: new Date(),
    })
    .where(eq(storePages.slug, slug));
}

/** Create a new custom page (starts as a hidden draft). Returns its slug. */
export async function createStorePage(
  titleEn: string,
  titleAr: string,
  desiredSlug?: string,
): Promise<string> {
  const db = requireStoreDb();
  const base = slugify(desiredSlug?.trim() || titleEn || titleAr || "");
  if (!base || base === "item") throw new ApiError("أدخل عنواناً أو رابطاً صالحاً");
  if (RESERVED_SLUGS.has(base)) throw new ApiError("هذا الرابط محجوز، اختر غيره");
  const existing = await db
    .select({ id: storePages.id })
    .from(storePages)
    .where(eq(storePages.slug, base))
    .limit(1);
  if (existing.length) throw new ApiError("يوجد صفحة بهذا الرابط بالفعل");
  // A friendly starter so the new page isn't blank.
  const starter: PageLayout = [
    { id: crypto.randomUUID(), type: "richText", visible: true, settings: {} },
  ];
  await db.insert(storePages).values({
    slug: base,
    kind: "custom",
    titleEn: titleEn.trim() || null,
    titleAr: titleAr.trim() || null,
    status: "draft",
    draftLayout: starter,
  });
  return base;
}

/** Delete a custom page (system pages like "home" can't be deleted). */
export async function deleteStorePage(slug: string): Promise<void> {
  const db = requireStoreDb();
  if (SYSTEM_SLUGS.has(slug)) throw new ApiError("لا يمكن حذف الصفحة النظامية");
  await db.delete(storePages).where(eq(storePages.slug, slug));
}

// ── Global site settings (announcement, footer, theme) ───────────────────────

const EMPTY_SITE_CONFIG: SiteConfig = {
  announcement: { enabled: false, text: { en: "", ar: "" } },
  footer: { tagline: { en: "", ar: "" } },
};

export interface SiteSettingsEditorData {
  /** The working config: draft when present, else published, else empty. */
  config: SiteConfig;
  hasUnpublishedDraft: boolean;
}

/** Load the singleton settings row for the editor. */
export async function getSiteSettingsForEditor(): Promise<SiteSettingsEditorData> {
  const db = requireStoreDb();
  const [row] = await db.select().from(storeSiteSettings).limit(1);
  if (!row) return { config: EMPTY_SITE_CONFIG, hasUnpublishedDraft: false };
  return {
    config: row.draftConfig ?? row.publishedConfig ?? EMPTY_SITE_CONFIG,
    hasUnpublishedDraft:
      row.draftConfig != null &&
      JSON.stringify(row.draftConfig) !== JSON.stringify(row.publishedConfig),
  };
}

async function ensureSettingsRow(db: Db): Promise<number> {
  const [row] = await db.select({ id: storeSiteSettings.id }).from(storeSiteSettings).limit(1);
  if (row) return row.id;
  const [created] = await db
    .insert(storeSiteSettings)
    .values({})
    .returning({ id: storeSiteSettings.id });
  return created.id;
}

/** Save global settings as the draft (not yet live). */
export async function saveSiteSettings(config: SiteConfig): Promise<void> {
  const db = requireStoreDb();
  const id = await ensureSettingsRow(db);
  await db
    .update(storeSiteSettings)
    .set({ draftConfig: config, updatedAt: new Date() })
    .where(eq(storeSiteSettings.id, id));
}

/** Publish global settings site-wide (announcement bar, footer, brand theme). */
export async function publishSiteSettings(config: SiteConfig): Promise<void> {
  const db = requireStoreDb();
  const id = await ensureSettingsRow(db);
  await db
    .update(storeSiteSettings)
    .set({ draftConfig: config, publishedConfig: config, updatedAt: new Date() })
    .where(eq(storeSiteSettings.id, id));
}
