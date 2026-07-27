import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { adoptExternalImage } from "@/lib/product-images";

/** Downloads an externally-found candidate image (from find-images) and
 * re-hosts it on our own Blob storage, returning our own stable URL. */
export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url) return ok({ error: "الرابط مطلوب" }, { status: 400 });

    const result = await adoptExternalImage(url, ctx.ownerId);
    return ok(result, { status: 201 });
  } catch (e) {
    console.error("POST /api/products/images/adopt", e);
    const message = e instanceof Error ? e.message : "تعذّر استخدام هذه الصورة";
    return ok({ error: message }, { status: 500 });
  }
}
