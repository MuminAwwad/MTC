import { z } from "zod/v4";
import { ok } from "@/lib/api-response";
import { withAuth, parseBody } from "@/lib/api-handler";
import { createStorePage } from "@/lib/store/content";

const createSchema = z.object({
  titleEn: z.string().default(""),
  titleAr: z.string().default(""),
  slug: z.string().optional(),
});

/** Create a new custom storefront page (starts as a hidden draft). */
export const POST = withAuth(async (req) => {
  const { titleEn, titleAr, slug } = await parseBody(req, createSchema);
  const created = await createStorePage(titleEn, titleAr, slug);
  return ok({ slug: created }, { status: 201 });
});
