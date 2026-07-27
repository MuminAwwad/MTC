import "server-only";

// Uses the native Gemini generateContent endpoint (not the OpenAI-compatible
// shim used elsewhere in this app) because Grounding with Google Search is
// only exposed there — the OpenAI-compat layer rejects the google_search
// tool. Lets the model look up the actual product online instead of
// guessing specs from training data.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeneratedProductDescription {
  description: string;
  sources: Array<{ title: string; uri: string }>;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export async function generateProductDescription(name: string): Promise<GeneratedProductDescription> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("لم يتم ضبط GEMINI_API_KEY في إعدادات البيئة");

  const prompt = `ابحث عن معلومات دقيقة وحديثة عن هذا المنتج: "${name}".
اكتب وصفًا تسويقيًا موجزًا بالعربية الفصحى لعرضه في متجر إلكتروني، بهذا الشكل بالضبط:
- جملة أو جملتين افتتاحيتين عن المنتج.
- سطر فارغ، ثم كل مواصفة تقنية مهمة بسطر منفصل يبدأ بـ "- ".
- سطر فارغ، ثم أبرز المزايا، كل ميزة بسطر منفصل يبدأ بـ "- ".
لا تخترع مواصفات غير مؤكدة؛ إذا لم تجد معلومة معينة تجاهلها بدل تخمينها. لا تذكر الأسعار. اكتب نص عادي فقط بدون عناوين Markdown (بدون # أو **).`;

  const res = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini generateContent error:", res.status, errText);
    throw new Error("تعذّر الاتصال بنموذج الذكاء الاصطناعي");
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("لم يستطع النموذج توليد وصف لهذا المنتج");

  const chunks: GroundingChunk[] = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => (c.web?.uri ? { title: c.web.title ?? c.web.uri, uri: c.web.uri } : null))
    .filter((s): s is { title: string; uri: string } => s !== null);

  return { description: text, sources };
}
