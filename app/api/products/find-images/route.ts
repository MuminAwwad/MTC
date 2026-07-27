import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { findProductImageCandidates } from "@/lib/product-images";

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  if (!process.env.GEMINI_API_KEY) {
    return ok({ error: "ميزة البحث بالذكاء الاصطناعي غير مهيأة (GEMINI_API_KEY مفقود)" }, { status: 500 });
  }

  try {
    const { name } = await req.json();
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return ok({ error: "اسم المنتج مطلوب" }, { status: 400 });

    const candidates = await findProductImageCandidates(trimmed);
    return ok({ candidates });
  } catch (e) {
    console.error("POST /api/products/find-images", e);
    const message = e instanceof Error ? e.message : "تعذّر البحث عن صور";
    return ok({ error: message }, { status: 500 });
  }
}
