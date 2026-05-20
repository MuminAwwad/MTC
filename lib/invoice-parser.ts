import * as XLSX from "xlsx";

export interface ParsedInvoice {
  supplier: {
    name: string | null;
    phone: string | null;
    company: string | null;
  };
  items: Array<{
    name: string;
    qty: number;
    unitCost: number;
    sku: string | null;
  }>;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  currency: "ILS" | "USD" | "JOD";
}

const SYSTEM_PROMPT = `You read purchase invoices for an electronics shop in Palestine and return ONLY a JSON object that matches this exact shape:

{
  "supplier": { "name": string|null, "phone": string|null, "company": string|null },
  "items": [{ "name": string, "qty": number, "unitCost": number, "sku": string|null }],
  "invoiceNumber": string|null,
  "invoiceDate": string|null,
  "totalAmount": number|null,
  "currency": "ILS"|"USD"|"JOD"
}

Rules:
- Default currency to "ILS" (₪ شيكل) if not stated.
- unitCost is the per-unit cost the shop paid (NOT the sale price).
- For each line item infer qty (default 1) and unitCost; if the line shows a line total split it: unitCost = total / qty.
- Skip header rows, subtotals, totals, taxes, discounts, footers — items only.
- Keep the item name in its original language (Arabic or English).
- supplier.name is the seller/issuer of the invoice. supplier.phone is the seller's phone, not the buyer's.
- invoiceDate must be ISO YYYY-MM-DD.
- If a value is unknown or absent, set it to null. Never invent.
- Respond with the JSON object only — no markdown fences, no commentary.`;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TEXT_MODEL = "llama-3.3-70b-versatile";

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Some models still wrap reasoning around the JSON; grab the outermost {...}
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new SyntaxError("No JSON object in model output");
  return JSON.parse(stripped.slice(start, end + 1));
}

type GroqMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

async function callGroq(model: string, messages: GroqMessage[]): Promise<ParsedInvoice> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as ParsedInvoice;
  parsed.supplier ??= { name: null, phone: null, company: null };
  parsed.items ??= [];
  parsed.currency ??= "ILS";
  return parsed;
}

export async function parseInvoiceFromImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
): Promise<ParsedInvoice> {
  return callGroq(VISION_MODEL, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract this purchase invoice into the schema." },
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
      ],
    },
  ]);
}

export async function parseInvoiceFromPdf(buffer: Buffer): Promise<ParsedInvoice> {
  // Dynamic import — pdf-parse is heavy and only needed for PDF uploads
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const { text } = await parser.getText();
  await parser.destroy();
  if (!text.trim()) throw new Error("لم نتمكن من قراءة نص الفاتورة من ملف PDF");
  return callGroq(TEXT_MODEL, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Below is the extracted text from a PDF purchase invoice. Extract it into the schema.\n\n${text}`,
    },
  ]);
}

export async function parseInvoiceFromXlsx(buffer: Buffer): Promise<ParsedInvoice> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `### Sheet: ${name}\n${csv}`;
  }).join("\n\n");
  return callGroq(TEXT_MODEL, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Below is the content of an xlsx purchase invoice exported to CSV (one block per sheet). Extract it into the schema.\n\n${sheets}`,
    },
  ]);
}
