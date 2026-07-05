import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { withAuth, parseBody } from "@/lib/api-handler";
import { deleteStorePage, publishPage, saveDraftLayout } from "@/lib/store/content";
import type { PageLayout } from "@/lib/store/types";

const sectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  visible: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  appearance: z
    .object({
      background: z
        .enum(["default", "surface", "muted", "dark", "navy", "primary", "custom"])
        .optional(),
      bgColor: z.string().optional(),
      paddingTop: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
      paddingBottom: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
      align: z.enum(["start", "center", "end"]).optional(),
      maxWidth: z.enum(["normal", "wide", "full"]).optional(),
    })
    .optional(),
});

const patchSchema = z.object({
  layout: z.array(sectionSchema),
  /** true → publish (copy draft into the live slot); false/absent → save draft. */
  publish: z.boolean().default(false),
});

/** Save a page's draft layout, or publish it when `publish: true`. */
export const PATCH = withAuth<{ slug: string }>(async (req, _ctx, { params }) => {
  const { slug } = await params;
  const { layout, publish } = await parseBody(req, patchSchema);
  if (publish) await publishPage(slug, layout as PageLayout);
  else await saveDraftLayout(slug, layout as PageLayout);
  return ok({ success: true });
});

/** Delete a custom page (system pages are protected). */
export const DELETE = withAuth<{ slug: string }>(async (_req, _ctx, { params }) => {
  const { slug } = await params;
  await deleteStorePage(slug);
  return ok({ success: true });
});
