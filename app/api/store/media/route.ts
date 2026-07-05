import { ok } from "@/lib/api-response";
import { withAuth, ApiError } from "@/lib/api-handler";
import { hasBlobToken, listMediaAssets, uploadMediaAsset } from "@/lib/store/media";

/** List media library assets (newest first). */
export const GET = withAuth(async () => {
  const assets = await listMediaAssets();
  return ok({ assets, uploadsEnabled: hasBlobToken() });
});

/** Upload one image to the store's Blob bucket. */
export const POST = withAuth(async (req) => {
  const form = await req.formData().catch(() => {
    throw new ApiError("صيغة الطلب غير صالحة", 400);
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("الملف مطلوب", 400);
  const result = await uploadMediaAsset(file);
  return ok(result, { status: 201 });
});
