import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/** Upload a product image to Blob storage. Not tied to a product id — the
 * returned URL is collected client-side and sent along with the rest of the
 * product form (works for both new and existing products). */
export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return ok({ error: "تخزين الصور غير مهيأ (BLOB_READ_WRITE_TOKEN غير موجود)" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return ok({ error: "لم يتم اختيار ملف" }, { status: 400 });
    }
    if (file.size === 0) return ok({ error: "الملف فارغ" }, { status: 400 });
    if (file.size > MAX_BYTES) return ok({ error: "حجم الصورة يتجاوز 10 ميغابايت" }, { status: 400 });
    if (file.type && !ALLOWED.includes(file.type)) {
      return ok({ error: "صيغة غير مدعومة. استخدم JPG أو PNG أو WEBP أو GIF أو AVIF" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const blob = await put(`products/${ctx.ownerId}/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });

    return ok({ url: blob.url }, { status: 201 });
  } catch (e) {
    console.error("POST /api/products/images", e);
    return ok({ error: "تعذّر رفع الصورة" }, { status: 500 });
  }
}

/** Best-effort delete of an image the user removed from a product's gallery
 * before saving — harmless if it's already gone or storage isn't configured. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url) return ok({ error: "الرابط مطلوب" }, { status: 400 });
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(url);
      } catch {
        /* already gone or not a blob URL we own — not worth failing the request */
      }
    }
    return ok({ success: true });
  } catch (e) {
    console.error("DELETE /api/products/images", e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
