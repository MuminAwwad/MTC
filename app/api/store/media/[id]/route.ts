import { ok } from "@/lib/api-response";
import { withAuth, ApiError } from "@/lib/api-handler";
import { deleteMediaAsset } from "@/lib/store/media";

/** Remove an asset from the media library (and Blob storage, best-effort). */
export const DELETE = withAuth<{ id: string }>(async (_req, _ctx, { params }) => {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("معرّف غير صالح", 400);
  await deleteMediaAsset(id);
  return ok({ success: true });
});
