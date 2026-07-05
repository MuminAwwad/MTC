import { ok } from "@/lib/api-response";
import { withAuth, parseBody } from "@/lib/api-handler";
import { createStoreProduct } from "@/lib/store/products";
import { manualProductSchema } from "@/lib/store/validation";

/** Create a manual store product (origin "manual" — never touched by syncs). */
export const POST = withAuth(async (req) => {
  const input = await parseBody(req, manualProductSchema);
  const created = await createStoreProduct(input);
  return ok(created, { status: 201 });
});
