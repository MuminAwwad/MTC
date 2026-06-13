import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { executeTool, getToolSchemas } from "@/lib/chat-tools";
import {
  getActionToolSchemas,
  isActionTool,
  previewAction,
  type StagedAction,
} from "@/lib/chat-actions";

// Gemini's OpenAI-compatible endpoint — lets us keep the OpenAI-style messages,
// tool_calls and JSON shape unchanged. We use gemini-2.5-flash with
// reasoning_effort:"none" (see payload): that disables its "thinking" tokens, so
// the small MAX_TOKENS budget below maps straight to the visible answer/tool call
// instead of being eaten by hidden reasoning.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-2.5-flash";
const MAX_TOOL_HOPS = 5;
// Recent-history window keeps each request small (the whole prompt is re-sent
// every hop). Gemini's free tier is far more generous than Groq's was.
const MAX_HISTORY = 10;
const MAX_TOKENS = 768;

// Single system prompt — the assistant always has BOTH read and write tools, so
// it must always know it can act. (Previously the write tools were gated behind
// an Arabic-keyword regex to save Groq tokens; that regex missed spellings like
// "إضافة" and made the model wrongly claim it couldn't change data. Gemini's
// budget makes the gating unnecessary, so it's gone.)
const SYSTEM_PROMPT = `أنت مساعد ذكي لمحل MTC Electronics في فلسطين، تساعد صاحب المحل في إدارة مبيعاته وزبائنه ومخزونه وديونه وتذاكر الصيانة.

لديك قدرتان:
١) القراءة: استرجاع البيانات عبر أدوات القراءة. لا تخمّن أرقاماً أبداً.
٢) التنفيذ: إجراء عمليات فعلية (إضافة/تعديل/حذف) نيابةً عن صاحب المحل عبر أدوات العمليات (create_customer, create_invoice, record_debt_payment, adjust_stock, update_ticket_status, delete_record ...).

قواعد مهمة:
- أنت لست مجرد نموذج لغوي — لديك أدوات فعلية تعدّل البيانات. لا تقل أبداً إنك لا تستطيع التنفيذ؛ بل استدعِ الأداة المناسبة. وإذا أعطاك المستخدم فاتورة شراء فبإمكانك إدخال أصنافها.
- حدّد المعرّفات (id) أولاً عبر أدوات البحث (find_customer / find_product / find_supplier / find_ticket / get_customer_debt). لا تخترع id.
- استدعاء أداة العملية لا ينفّذها فوراً، بل يعرض ملخصاً لصاحب المحل ليؤكده بنفسه. لذلك لا تقل "تم" بصيغة الماضي؛ بل اذكر باختصار ما ستفعله.
- إذا نقصت معلومة ضرورية لإتمام العملية اسأل عنها أولاً. ونبّه باختصار قبل أي حذف نهائي.
- الردود مختصرة وبالعربية الفصحى البسيطة، إلا إذا سأل المستخدم بالإنجليزية.
- صيغة العملة: ₪X.XX. استعمل bullet points مختصرة للقوائم.
- إذا سألك المستخدم سؤالاً لا يخص أعمال المحل اعتذر بأدب.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;

  if (!process.env.GEMINI_API_KEY) {
    return ok({ error: "المساعد الذكي غير مهيأ (GEMINI_API_KEY مفقود)" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const incoming: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    // Cap to recent history to keep the prompt small and avoid runaway costs.
    const recent = incoming.slice(-MAX_HISTORY);

    const conversation: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...recent,
    ];

    // Always expose both read and write tools so the assistant can act on any
    // request without a brittle keyword check deciding for it.
    const tools = [...getToolSchemas(), ...getActionToolSchemas()];

    const headers = {
      Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      "Content-Type": "application/json",
    };

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const payload = JSON.stringify({
        model: MODEL,
        messages: conversation,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
        reasoning_effort: "none", // disable Gemini 2.5 "thinking" — keeps replies fast and within MAX_TOKENS
      });

      let res = await fetch(GEMINI_URL, { method: "POST", headers, body: payload });

      // On a rate-limit, retry once automatically if the cooldown is short;
      // otherwise tell the user how long to wait.
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 6) {
          await sleep((retryAfter + 0.3) * 1000);
          res = await fetch(GEMINI_URL, { method: "POST", headers, body: payload });
        }
        if (res.status === 429) {
          const ra = Number(res.headers.get("retry-after"));
          const secs = Number.isFinite(ra) && ra > 0 ? Math.ceil(ra) : 20;
          return ok(
            { error: `النموذج مشغول حالياً (تجاوزت الحد المسموح مؤقتاً). أعد المحاولة بعد ${secs} ثانية.` },
            { status: 429 }
          );
        }
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini chat error:", res.status, errText);
        // Surface the real upstream message — it's almost always a tool-schema
        // mismatch or rate limit, both of which are useful to see in the UI.
        let detail = errText;
        try {
          const parsed = JSON.parse(errText);
          detail = parsed?.error?.message ?? errText;
        } catch {
          /* keep raw */
        }
        return ok(
          { error: `تعذّر الاتصال بنموذج الذكاء الاصطناعي: ${detail.slice(0, 300)}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) {
        return ok({ error: "استجابة غير صالحة من النموذج" }, { status: 502 });
      }

      // Final answer (no more tool calls)
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return ok({
          reply: msg.content ?? "",
          toolHops: hop,
        });
      }

      // Push the assistant turn (with tool_calls) into history before running tools
      conversation.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      // Run every requested tool call, scoped to this user, in parallel.
      // Read tools return data the model can keep reasoning over. Action tools
      // (writes) are NOT executed here — they're previewed and staged for the
      // user's explicit confirmation.
      const staged: StagedAction[] = [];
      const results = await Promise.all(
        (msg.tool_calls as ToolCall[]).map(async (call: ToolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments
              ? JSON.parse(call.function.arguments)
              : {};
          } catch {
            return { id: call.id, result: { error: "invalid_tool_arguments" } };
          }

          if (isActionTool(call.function.name)) {
            const preview = await previewAction(call.function.name, ctx.dbUser.id, args);
            if (preview.ok) {
              staged.push(preview.action);
              return { id: call.id, result: { staged: true, summary: preview.action.summary } };
            }
            return { id: call.id, result: { error: preview.error } };
          }

          const result = await executeTool(call.function.name, ctx.dbUser.id, args);
          return { id: call.id, result };
        })
      );

      for (const r of results) {
        conversation.push({
          role: "tool",
          tool_call_id: r.id,
          content: JSON.stringify(r.result),
        });
      }

      // If any write was staged this turn, stop and hand the proposed
      // action(s) to the client for confirmation instead of looping further.
      if (staged.length > 0) {
        return ok({
          reply: typeof msg.content === "string" ? msg.content : "",
          pendingActions: staged,
          toolHops: hop,
        });
      }
    }

    return ok(
      { error: "لم يصل المساعد إلى جواب نهائي بعد عدة محاولات. حاول إعادة الصياغة." },
      { status: 504 }
    );
  } catch (e) {
    console.error("POST /api/chat", e);
    return ok({ error: "خطأ في الخادم" }, { status: 500 });
  }
}
