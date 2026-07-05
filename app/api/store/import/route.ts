import { ok } from "@/lib/api-response";
import { withAuth, ApiError } from "@/lib/api-handler";
import { runStoreImport } from "@/lib/store/sync";

export const maxDuration = 300;

/** Import store products from an uploaded CSV / Excel / JSON file. */
export const POST = withAuth(async (req) => {
  const form = await req.formData().catch(() => {
    throw new ApiError("صيغة الطلب غير صالحة", 400);
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("الملف مطلوب", 400);
  if (file.size > 10 * 1024 * 1024) throw new ApiError("الحد الأقصى لحجم الملف 10MB", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const report = await runStoreImport(
    { buffer, filename: file.name, contentType: file.type },
    { source: "upload", filename: file.name, mode: "upsert" },
  );
  return ok(report, { status: report.ok ? 200 : 500 });
});
