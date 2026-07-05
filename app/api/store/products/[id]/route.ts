import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { withAuth, parseBody, ApiError } from "@/lib/api-handler";
import {
  deleteStoreProduct,
  saveStoreProductEdits,
  setStoreProductStatus,
  updateStoreManualProduct,
} from "@/lib/store/products";
import { manualProductSchema, overridesSchema, statusSchema } from "@/lib/store/validation";

// One of three shapes:
//   { status }                 → quick publish/draft/archive toggle
//   { overrides, status }      → save synced-product edits (final touches)
//   { manual: {...} }          → full update of a manual product
const patchSchema = z.union([
  z.object({ manual: manualProductSchema }),
  z.object({ overrides: overridesSchema, status: statusSchema }),
  z.object({ status: statusSchema }),
]);

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("معرّف غير صالح", 400);
  return id;
}

export const PATCH = withAuth<{ id: string }>(async (req, _ctx, { params }) => {
  const id = parseId((await params).id);
  const body = await parseBody(req, patchSchema);

  if ("manual" in body) {
    const result = await updateStoreManualProduct(id, body.manual);
    return ok(result);
  }
  if ("overrides" in body) {
    await saveStoreProductEdits(id, body.overrides, body.status);
    return ok({ success: true });
  }
  await setStoreProductStatus(id, body.status);
  return ok({ success: true });
});

/** Permanently delete a manual product. Synced products are archived instead. */
export const DELETE = withAuth<{ id: string }>(async (_req, _ctx, { params }) => {
  const id = parseId((await params).id);
  await deleteStoreProduct(id);
  return ok({ success: true });
});
