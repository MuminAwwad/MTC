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

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_HOPS = 5;
// Smaller history window keeps each request well under Groq's per-minute token
// budget (free tier is 12k TPM and the whole prompt is re-sent every hop).
const MAX_HISTORY = 10;
const MAX_TOKENS = 768;

const BASE_PROMPT = `أنت مساعد ذكي لمحل MTC Electronics في فلسطين. تجيب عن أسئلة صاحب المحل عن مبيعاته وزبائنه ومخزونه وديونه وتذاكر الصيانة.

قواعد:
- استخدم أدوات القراءة لاسترجاع البيانات. لا تخمّن أرقاماً أبداً.
- الردود مختصرة وبالعربية الفصحى البسيطة، إلا إذا سأل المستخدم بالإنجليزية.
- صيغة العملة: ₪X.XX. استعمل bullet points مختصرة للقوائم.
- إذا سألك المستخدم سؤالاً لا يخص أعمال المحل اعتذر بأدب.`;

// Appended only when the user's message looks like an action request — keeps
// read-only turns lean.
const ACTION_PROMPT = `يمكنك أيضاً تنفيذ عمليات (إضافة/تعديل/حذف) نيابةً عن المستخدم:
- استدعِ أداة العملية المناسبة (create_customer, create_invoice, record_debt_payment, adjust_stock, update_ticket_status, delete_record ...).
- حدّد المعرّفات (id) أولاً عبر أدوات البحث (find_customer / find_product / find_supplier / find_ticket / get_customer_debt). لا تخترع id.
- استدعاء الأداة لا ينفّذها فوراً بل يعرضها للمستخدم ليؤكدها. لا تقل "تم"؛ بل اذكر باختصار ما ستفعله.
- إذا نقصت معلومة ضرورية اسأل عنها أولاً. ونبّه باختصار قبل أي حذف نهائي.`;

// Broad heuristic: does the latest user message ask for a change? When false we
// skip the action tool schemas + action prompt entirely (big token saving for
// the common "just a question" case).
const ACTION_INTENT =
  /(أض|اضف|ضيف|سجّل|سجل|أنشئ|انشئ|إنشاء|انشاء|اعمل|سوي|احذف|امسح|الغ|ألغ|إلغاء|الغاء|عدّل|عدل|غيّر|غير|حدّث|حدث|ادفع|سدّد|سدد|دفعة|أصدر|اصدر|زد|انقص|اصرف|افتح|create|add|new|make|delete|remove|update|edit|change|record|pay|payment|cancel|adjust|issue|register)/i;

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

  if (!process.env.GROQ_API_KEY) {
    return ok({ error: "المساعد الذكي غير مهيأ (GROQ_API_KEY مفقود)" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const incoming: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    // Cap to recent history to keep the prompt small and avoid runaway costs.
    const recent = incoming.slice(-MAX_HISTORY);

    // Only enable the (token-heavy) write tools when the latest user message
    // looks like an action request.
    const lastUser = [...recent].reverse().find((m) => m.role === "user")?.content ?? "";
    const wantsAction = ACTION_INTENT.test(lastUser);

    const conversation: ChatMessage[] = [
      { role: "system", content: wantsAction ? `${BASE_PROMPT}\n\n${ACTION_PROMPT}` : BASE_PROMPT },
      ...recent,
    ];

    const tools = wantsAction
      ? [...getToolSchemas(), ...getActionToolSchemas()]
      : getToolSchemas();

    const headers = {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
      });

      let res = await fetch(GROQ_URL, { method: "POST", headers, body: payload });

      // On a rate-limit, retry once automatically if the cooldown is short;
      // otherwise tell the user how long to wait.
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 6) {
          await sleep((retryAfter + 0.3) * 1000);
          res = await fetch(GROQ_URL, { method: "POST", headers, body: payload });
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
        console.error("Groq chat error:", res.status, errText);
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
