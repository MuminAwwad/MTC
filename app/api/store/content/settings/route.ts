import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { withAuth, parseBody } from "@/lib/api-handler";
import { publishSiteSettings, saveSiteSettings } from "@/lib/store/content";
import type { SiteConfig } from "@/lib/store/types";

// The SiteConfig shape is owned by the storefront and evolves there; validate
// the envelope and pass the config through (the editor only produces known keys).
const patchSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  publish: z.boolean().default(false),
});

/** Save global storefront settings (draft), or publish when `publish: true`. */
export const PATCH = withAuth(async (req) => {
  const { config, publish } = await parseBody(req, patchSchema);
  const cfg = config as unknown as SiteConfig;
  if (publish) await publishSiteSettings(cfg);
  else await saveSiteSettings(cfg);
  return ok({ success: true });
});
