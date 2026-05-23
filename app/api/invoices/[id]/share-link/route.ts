import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invoice-pdfs";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Uploads the rendered invoice PDF to a public Supabase Storage bucket and
 * returns a CDN URL the customer can open from WhatsApp. The bucket is
 * created on first use. The PDF path is `${ownerId}/${invoiceId}.pdf` so
 * each owner's invoices live in their own folder and a re-share overwrites
 * the previous file (the URL stays stable).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ownerId: ctx.dbUser.id, isDeleted: false },
      select: { id: true, invoiceNumber: true },
    });
    if (!invoice) return ok({ error: "الفاتورة غير موجودة" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return ok({ error: "لم يتم رفع أي ملف" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return ok({ error: "حجم الملف أكبر من 5 ميجابايت" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return ok({ error: "الملف يجب أن يكون PDF" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Ensure the bucket exists. Cheap to call repeatedly — listBuckets is a
    // single API call, and createBucket fails idempotently if the bucket
    // already exists (we ignore that specific error).
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.error("listBuckets:", listErr);
      return ok({ error: "تعذّر الوصول إلى التخزين" }, { status: 500 });
    }
    if (!buckets?.some((b) => b.name === BUCKET)) {
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_SIZE,
        allowedMimeTypes: ["application/pdf"],
      });
      if (createErr && !/already exists/i.test(createErr.message)) {
        console.error("createBucket:", createErr);
        return ok({ error: "تعذّر إنشاء مساحة التخزين" }, { status: 500 });
      }
    }

    const path = `${ctx.dbUser.id}/${id}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "60", // short TTL so re-shares show the latest version
      });
    if (uploadErr) {
      console.error("upload:", uploadErr);
      return ok({ error: "فشل رفع الملف" }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Bust the CDN cache after a re-share so customers don't see the stale PDF.
    const url = `${pub.publicUrl}?t=${Date.now()}`;

    return ok({ url });
  } catch (e) {
    console.error("POST /api/invoices/[id]/share-link", e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
