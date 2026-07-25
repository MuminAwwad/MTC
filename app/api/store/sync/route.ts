import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/api-handler";
import { runManagementSync } from "@/lib/store/sync";

// A full catalog sync can take a while on cold connections.
export const maxDuration = 300;

/** Sync the store catalog from this system's products (manual trigger). */
export const POST = withAuth(async (_req, ctx) => {
  const report = await runManagementSync(ctx.ownerId, { source: "manual" });
  return ok(report, { status: report.ok ? 200 : 500 });
});
