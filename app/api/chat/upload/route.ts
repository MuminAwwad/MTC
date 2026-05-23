import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  buildPreview,
  envelopeIsImportable,
  extractFromImage,
  extractFromPdf,
  extractFromXlsx,
  MAX_UPLOAD_SIZE,
  type DraftEnvelope,
} from "@/lib/chat-import";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return ok({ error: "لم يتم رفع أي ملف" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return ok({ error: "حجم الملف أكبر من 10 ميجابايت" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = (file.type || "").toLowerCase();
    const name = file.name.toLowerCase();

    let envelope: DraftEnvelope;

    if (mime.startsWith("image/")) {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
      const mediaType = allowed.find((m) => m === mime);
      if (!mediaType) {
        return ok({ error: "نوع الصورة غير مدعوم" }, { status: 400 });
      }
      envelope = await extractFromImage(buffer.toString("base64"), mediaType);
    } else if (mime === "application/pdf" || name.endsWith(".pdf")) {
      envelope = await extractFromPdf(buffer);
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel" ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls")
    ) {
      envelope = await extractFromXlsx(buffer);
    } else {
      return ok(
        { error: "نوع الملف غير مدعوم. ارفع صورة أو PDF أو xlsx." },
        { status: 400 }
      );
    }

    return ok({
      envelope,
      preview: buildPreview(envelope),
      canImport: envelopeIsImportable(envelope),
    });
  } catch (e) {
    console.error("POST /api/chat/upload", e);
    const detail = e instanceof Error ? e.message : String(e);
    return ok(
      { error: `تعذّر قراءة الملف: ${detail}` },
      { status: 500 }
    );
  }
}
