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
- unitCost is the per-unit cost the shop paid (NOT the sale price, NOT the line total). It is what one piece of the item cost.
- For each line item, find these three numbers on the row: qty, unitCost, and line total. If the row shows all three, use the unitCost column directly. If only qty and line total are shown, set unitCost = lineTotal / qty. If only a single price is shown with qty 1, that price is the unitCost.
- Numbers can use Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩); convert to standard digits.
- Skip header rows, subtotals, totals, taxes/VAT, discounts, shipping, and footers — only return actual item rows.
- Keep item names in their original language (Arabic or English). Do not translate.
- supplier.name is the seller/issuer of the invoice. supplier.phone is the seller's phone, not the buyer's.
- invoiceDate must be ISO YYYY-MM-DD.
- If a value is unknown or absent, set it to null. Never invent.
- Sanity check: sum(qty * unitCost) over your items should be close to the printed invoice subtotal/total. If your numbers are an order of magnitude off, re-check whether you mistook a line total for unitCost or vice versa.
- Respond with the JSON object only — no markdown fences, no commentary, no reasoning blocks before/after.`;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
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

async function callGroq(model: string, messages: GroqMessage[], opts?: { jsonMode?: boolean }): Promise<ParsedInvoice> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("لم يتم ضبط GROQ_API_KEY في إعدادات البيئة");
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0,
    max_tokens: 4096,
  };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let detail = errBody;
    try {
      const json = JSON.parse(errBody);
      detail = json.error?.message ?? errBody;
    } catch { /* keep raw */ }
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("الموديل أعاد رد فارغ");
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
  // Vision models on Groq don't support a separate `system` role; bake the
  // instructions into the user turn instead.
  return callGroq(VISION_MODEL, [
    {
      role: "user",
      content: [
        { type: "text", text: `${SYSTEM_PROMPT}\n\nExtract the attached purchase invoice into the schema.` },
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
      ],
    },
  ]);
}

export async function parseInvoiceFromPdf(buffer: Buffer): Promise<ParsedInvoice> {
  // Dynamic import — unpdf bundles pdfjs-dist with serverless-friendly shims
  const { extractTextItems } = await import("unpdf");
  const { items } = await extractTextItems(new Uint8Array(buffer));
  // Rebuild reading order: per page, group items by y-bucket (rows), then
  // sort within each row by x. This preserves invoice tables which `extractText`
  // mangles by emitting cells in PDF-internal order.
  const pages = items.map((pageItems, pageIdx) => {
    const filtered = pageItems.filter((it) => it.str.trim());
    if (filtered.length === 0) return `### Page ${pageIdx + 1}\n(empty)`;
    const yTolerance = Math.max(2, (filtered[0]?.height ?? 10) * 0.5);
    const rows: Array<{ y: number; items: typeof filtered }> = [];
    for (const it of filtered) {
      const row = rows.find((r) => Math.abs(r.y - it.y) <= yTolerance);
      if (row) row.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y); // top → bottom (PDF y origin is bottom-left)
    const lines = rows.map((row) => {
      const sorted = [...row.items].sort((a, b) => a.x - b.x);
      return sorted.map((it) => it.str).join("  ");
    });
    return `### Page ${pageIdx + 1}\n${lines.join("\n")}`;
  });
  const merged = pages.join("\n\n");
  if (!merged.trim()) throw new Error("لم نتمكن من قراءة نص الفاتورة من ملف PDF (قد يكون ممسوحًا ضوئيًا — جرّب رفعه كصورة)");
  return callGroq(
    TEXT_MODEL,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Below is text extracted from a PDF purchase invoice with the original spatial layout preserved (each line of text corresponds to a row on the page; consecutive items separated by spaces are columns within that row). Extract it into the schema.\n\n${merged}`,
      },
    ],
    { jsonMode: true }
  );
}

export async function parseInvoiceFromXlsx(buffer: Buffer): Promise<ParsedInvoice> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `### Sheet: ${name}\n${csv}`;
  }).join("\n\n");
  return callGroq(
    TEXT_MODEL,
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Below is the content of an xlsx purchase invoice exported to CSV (one block per sheet). Extract it into the schema.\n\n${sheets}`,
      },
    ],
    { jsonMode: true }
  );
}
