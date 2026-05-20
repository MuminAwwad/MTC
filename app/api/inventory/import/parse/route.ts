import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import {
  parseInvoiceFromImage,
  parseInvoiceFromPdf,
  parseInvoiceFromXlsx,
  type ParsedInvoice,
} from "@/lib/invoice-parser";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return ok({ error: "لم يتم رفع أي ملف" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return ok({ error: "حجم الملف أكبر من 10 ميجابايت" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "";
    let parsed: ParsedInvoice;

    if (mime.startsWith("image/")) {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
      const mediaType = allowed.find((m) => m === mime);
      if (!mediaType) {
        return ok({ error: "نوع الصورة غير مدعوم" }, { status: 400 });
      }
      parsed = await parseInvoiceFromImage(buffer.toString("base64"), mediaType);
    } else if (mime === "application/pdf") {
      parsed = await parseInvoiceFromPdf(buffer);
    } else if (
      mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mime === "application/vnd.ms-excel" ||
      file.name.toLowerCase().endsWith(".xlsx") ||
      file.name.toLowerCase().endsWith(".xls")
    ) {
      parsed = await parseInvoiceFromXlsx(buffer);
    } else {
      return ok(
        { error: "نوع الملف غير مدعوم. ارفع صورة أو PDF أو xlsx" },
        { status: 400 }
      );
    }

    return ok(parsed);
  } catch (e) {
    console.error("POST /api/inventory/import/parse", e);
    const detail = e instanceof Error ? e.message : String(e);
    const message =
      e instanceof SyntaxError
        ? `تعذر تحليل الفاتورة (ليست JSON صحيح): ${detail}`
        : `فشل استخراج البيانات من الفاتورة: ${detail}`;
    return ok({ error: message }, { status: 500 });
  }
}
