import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { commitAction, isActionTool, type StagedAction } from "@/lib/chat-actions";

export const dynamic = "force-dynamic";

// The client posts back the action it received from /api/chat. We re-validate
// the shape here and the per-action commit() re-checks every id against the
// owner, so a tampered or stale payload can never write outside the shop.
function isStagedAction(v: unknown): v is StagedAction {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.kind === "string" &&
    isActionTool(a.kind) &&
    a.payload != null &&
    typeof a.payload === "object" &&
    typeof a.summary === "string"
  );
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const action = body?.action as unknown;
    if (!isStagedAction(action)) {
      return ok({ error: "العملية غير صالحة" }, { status: 400 });
    }

    const result = await commitAction(ctx.dbUser.id, ctx.dbUser.id, action);
    if ("error" in result) {
      return ok({ error: result.error }, { status: 400 });
    }
    return ok(result);
  } catch (e) {
    console.error("POST /api/chat/action", e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
