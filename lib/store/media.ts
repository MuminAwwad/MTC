// Media library for the store: uploads go to the STORE's Vercel Blob bucket
// (the storefront serves these URLs), recorded in its media_assets table.
// Ported from the storefront repo's lib/actions/media.ts.

import "server-only";
import { del, put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api-handler";
import { getStoreDb } from "./db";
import { storeMediaAssets, type StoreMediaAssetRow } from "./schema";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export const hasBlobToken = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function listMediaAssets(limit = 100): Promise<StoreMediaAssetRow[]> {
  const db = getStoreDb();
  if (!db) return [];
  return db
    .select()
    .from(storeMediaAssets)
    .orderBy(desc(storeMediaAssets.createdAt))
    .limit(limit);
}

/** Upload one image to the store's Blob bucket and record it in the library. */
export async function uploadMediaAsset(file: File): Promise<{ url: string }> {
  if (!hasBlobToken()) {
    throw new ApiError("تخزين الصور غير مهيأ (BLOB_READ_WRITE_TOKEN غير موجود)", 503);
  }
  if (file.size === 0) throw new ApiError("لم يتم اختيار ملف");
  if (file.size > MAX_BYTES) throw new ApiError("حجم الصورة يتجاوز 10 ميغابايت");
  if (file.type && !ALLOWED.includes(file.type)) {
    throw new ApiError("صيغة غير مدعومة. استخدم JPG أو PNG أو WEBP أو GIF");
  }

  // A random suffix avoids collisions while keeping the original name readable.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const blob = await put(`products/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  // Record in the media library (best-effort — upload still succeeds if this fails).
  const db = getStoreDb();
  if (db) {
    try {
      await db.insert(storeMediaAssets).values({
        url: blob.url,
        pathname: blob.pathname,
        contentType: file.type || null,
        size: file.size,
      });
    } catch {
      /* media-library bookkeeping is non-critical */
    }
  }

  return { url: blob.url };
}

/** Remove an asset from the library and (best-effort) from Blob storage. */
export async function deleteMediaAsset(id: number): Promise<void> {
  const db = getStoreDb();
  if (!db) throw new ApiError("قاعدة بيانات المتجر غير مهيأة", 503);
  const [row] = await db
    .select()
    .from(storeMediaAssets)
    .where(eq(storeMediaAssets.id, id))
    .limit(1);
  if (!row) throw new ApiError("الملف غير موجود", 404);
  await db.delete(storeMediaAssets).where(eq(storeMediaAssets.id, id));
  if (hasBlobToken() && row.url) {
    try {
      await del(row.url);
    } catch {
      /* the library row is gone; a stray blob is harmless */
    }
  }
}
