import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { executeTool, getToolSchemas } from "@/lib/chat-tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_HOPS = 5;

const SYSTEM_PROMPT = `أنت مساعد ذكي لمحل MTC Electronics في فلسطين. مهمتك الإجابة عن أسئلة صاحب المحل عن مبيعاته وزبائنه ومخزونه وديونه وتذاكر الصيانة.

قواعد:
- استخدم الأدوات (tools) المتوفرة لاسترجاع البيانات. لا تخمّن أرقاماً أبداً.
- إذا احتجت لمعرفة عميل أو منتج بالاسم، استدعِ find_customer أو find_product أولاً للحصول على المعرّف (id).
- التاريخ اليوم متاح عبر الأدوات حسب الحاجة (get_sales_period يقبل تواريخ صريحة).
- الردود مختصرة وبالعربية الفصحى البسيطة، إلا إذا سأل المستخدم بالإنجليزية.
- صيغة العملة: ₪X.XX (شيكل).
- عندما تعرض قوائم (ديون، فواتير...)، استعمل bullet points مختصرة. لا تكرر بيانات لم يطلبها المستخدم.
- إذا سألك المستخدم سؤالاً لا يخص أعمال المحل (سياسة، طقس، ترفيه...) اعتذر بأدب وذكّره بأنك مخصّص لإدارة المحل.`;

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
    const recent = incoming.slice(-20);

    const conversation: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...recent,
    ];

    const tools = getToolSchemas();

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: conversation,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
          max_tokens: 1024,
        }),
      });

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

      // Run every requested tool call, scoped to this user, in parallel
      const results = await Promise.all(
        (msg.tool_calls as ToolCall[]).map(async (call: ToolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments
              ? JSON.parse(call.function.arguments)
              : {};
          } catch {
            return {
              id: call.id,
              result: { error: "invalid_tool_arguments" },
            };
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
