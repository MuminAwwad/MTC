import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { buildExportDataset, isExportType } from "@/lib/export/datasets";

export async function GET(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") ?? "";
    if (!isExportType(type)) {
      return ok({ error: "نوع تقرير غير معروف" }, { status: 400 });
    }

    const dataset = await buildExportDataset(type, ctx.dbUser.id, searchParams);
    return ok(dataset);
  } catch (e) {
    console.error("GET /api/export", e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
