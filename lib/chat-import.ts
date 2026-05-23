import * as XLSX from "xlsx";

// Multi-kind document extractor for the chat assistant. Takes an uploaded
// file (image/PDF/XLSX), converts it to model-friendly content, and asks
// Groq to detect WHAT kind of import this is and extract structured data.
// Commit happens in /api/chat/commit after the user reviews the preview.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
const TEXT_MODEL = "llama-3.3-70b-versatile";

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export type Currency = "ILS" | "USD" | "JOD";

export interface PurchaseInvoiceData {
  supplier: { name: string | null; phone: string | null; company: string | null };
  items: Array<{ name: string; qty: number; unitCost: number; sku: string | null }>;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  currency: Currency;
}

export interface DebtsData {
  rows: Array<{
    customerName: string;
    customerPhone: string | null;
    amount: number;
    dueDate: string | null;
    notes: string | null;
  }>;
}

export interface CustomersData {
  rows: Array<{
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
  }>;
}

export interface ProductsData {
  rows: Array<{
    name: string;
    sku: string | null;
    barcode: string | null;
    costPrice: number | null;
    sellPrice: number;
    stockQty: number;
    minStockQty: number | null;
    categoryName: string | null;
  }>;
}

export type DraftEnvelope =
  | { kind: "purchase_invoice"; data: PurchaseInvoiceData }
  | { kind: "debts"; data: DebtsData }
  | { kind: "customers"; data: CustomersData }
  | { kind: "products"; data: ProductsData }
  | { kind: "unknown"; reason: string };

const DETECTION_PROMPT = `You receive the content of a document the shop owner of a small electronics shop in Palestine uploaded. Determine what kind of import this is and extract structured data. Return ONLY a JSON object — no markdown, no commentary.

If it is a SUPPLIER PURCHASE INVOICE (the shop bought goods from a vendor):
{
  "kind": "purchase_invoice",
  "supplier": { "name": string|null, "phone": string|null, "company": string|null },
  "items": [{ "name": string, "qty": number, "unitCost": number, "sku": string|null }],
  "invoiceNumber": string|null,
  "invoiceDate": "YYYY-MM-DD"|null,
  "totalAmount": number|null,
  "currency": "ILS"|"USD"|"JOD"
}

If it is a CUSTOMER DEBTS list (people who owe the shop money — has amounts/أمانات/ديون per name):
{
  "kind": "debts",
  "rows": [{ "customerName": string, "customerPhone": string|null, "amount": number, "dueDate": "YYYY-MM-DD"|null, "notes": string|null }]
}

If it is a CUSTOMERS list (contacts only — names + phones + addresses, no amounts):
{
  "kind": "customers",
  "rows": [{ "name": string, "phone": string|null, "address": string|null, "notes": string|null }]
}

If it is a PRODUCTS catalog (items to add to inventory — has cost and/or sell prices and quantities):
{
  "kind": "products",
  "rows": [{ "name": string, "sku": string|null, "barcode": string|null, "costPrice": number|null, "sellPrice": number, "stockQty": number, "minStockQty": number|null, "categoryName": string|null }]
}

If you can't determine the kind or extract meaningful rows:
{ "kind": "unknown", "reason": "<short Arabic explanation>" }

Rules:
- Convert Arabic-Indic digits (٠-٩) to standard digits.
- Default currency "ILS" if not stated.
- Keep names in their original language. Do not translate.
- Dates: convert any format to YYYY-MM-DD.
- Skip header rows, totals, blank rows.
- For purchase invoices: unitCost is the per-unit cost the shop paid. If only qty + line total are shown, compute unitCost = lineTotal / qty.
- For debts: if a column says "أمانة" / "دين" / "متبقي" / "remaining" / "balance" with amounts, treat each non-zero amount as a debt row.
- For products: sellPrice is the price the shop sells to customers; if only one price column is shown and the doc looks like a price list, treat that as sellPrice.
- If a value is unknown, set it to null. Never invent.`;

interface GroqTextMsg { role: "system" | "user" | "assistant"; content: string }
interface GroqVisionMsg {
  role: "user";
  content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

async function callGroq(
  model: string,
  messages: Array<GroqTextMsg | GroqVisionMsg>,
  opts?: { jsonMode?: boolean }
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY غير مهيأ");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0,
    max_tokens: 4096,
  };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    let detail = errBody;
    try {
      const json = JSON.parse(errBody);
      detail = json?.error?.message ?? errBody;
    } catch {
      /* keep raw */
    }
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new SyntaxError("No JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1));
}

// Coerce / lightly validate whatever the model returned into a DraftEnvelope.
// Drops malformed rows silently; the user gets the count in the preview so
// they can spot under-counts.
function normalize(raw: unknown): DraftEnvelope {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const kind = String(obj.kind ?? "unknown");
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);

  switch (kind) {
    case "purchase_invoice": {
      const supplier = (obj.supplier ?? {}) as Record<string, unknown>;
      const itemsRaw = Array.isArray(obj.items) ? obj.items : [];
      const items = itemsRaw
        .map((it) => {
          const r = it as Record<string, unknown>;
          const name = str(r.name);
          const qty = num(r.qty);
          const unitCost = num(r.unitCost);
          if (!name || !qty || qty <= 0 || unitCost == null || unitCost < 0) return null;
          return { name, qty, unitCost, sku: str(r.sku) };
        })
        .filter(Boolean) as PurchaseInvoiceData["items"];
      const currencyRaw = str(obj.currency);
      const currency: Currency =
        currencyRaw === "USD" || currencyRaw === "JOD" ? currencyRaw : "ILS";
      return {
        kind: "purchase_invoice",
        data: {
          supplier: {
            name: str(supplier.name),
            phone: str(supplier.phone),
            company: str(supplier.company),
          },
          items,
          invoiceNumber: str(obj.invoiceNumber),
          invoiceDate: str(obj.invoiceDate),
          totalAmount: num(obj.totalAmount),
          currency,
        },
      };
    }

    case "debts": {
      const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
      const rows = rowsRaw
        .map((r) => {
          const rec = r as Record<string, unknown>;
          const name = str(rec.customerName);
          const amount = num(rec.amount);
          if (!name || !amount || amount <= 0) return null;
          return {
            customerName: name,
            customerPhone: str(rec.customerPhone),
            amount,
            dueDate: str(rec.dueDate),
            notes: str(rec.notes),
          };
        })
        .filter(Boolean) as DebtsData["rows"];
      return { kind: "debts", data: { rows } };
    }

    case "customers": {
      const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
      const rows = rowsRaw
        .map((r) => {
          const rec = r as Record<string, unknown>;
          const name = str(rec.name);
          if (!name) return null;
          return {
            name,
            phone: str(rec.phone),
            address: str(rec.address),
            notes: str(rec.notes),
          };
        })
        .filter(Boolean) as CustomersData["rows"];
      return { kind: "customers", data: { rows } };
    }

    case "products": {
      const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
      const rows = rowsRaw
        .map((r) => {
          const rec = r as Record<string, unknown>;
          const name = str(rec.name);
          const sellPrice = num(rec.sellPrice);
          if (!name || sellPrice == null || sellPrice < 0) return null;
          return {
            name,
            sku: str(rec.sku),
            barcode: str(rec.barcode),
            costPrice: num(rec.costPrice),
            sellPrice,
            stockQty: Math.max(0, Math.floor(num(rec.stockQty) ?? 0)),
            minStockQty: num(rec.minStockQty) != null ? Math.floor(num(rec.minStockQty)!) : null,
            categoryName: str(rec.categoryName),
          };
        })
        .filter(Boolean) as ProductsData["rows"];
      return { kind: "products", data: { rows } };
    }

    default:
      return { kind: "unknown", reason: str(obj.reason) ?? "نوع المستند غير معروف" };
  }
}

export async function extractFromImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
): Promise<DraftEnvelope> {
  const out = await callGroq(VISION_MODEL, [
    {
      role: "user",
      content: [
        { type: "text", text: DETECTION_PROMPT },
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
      ],
    },
  ]);
  return normalize(extractJson(out));
}

export async function extractFromPdf(buffer: Buffer): Promise<DraftEnvelope> {
  const { extractTextItems } = await import("unpdf");
  const { items } = await extractTextItems(new Uint8Array(buffer));
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
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map((row) => {
      const sorted = [...row.items].sort((a, b) => a.x - b.x);
      return sorted.map((it) => it.str).join("  ");
    });
    return `### Page ${pageIdx + 1}\n${lines.join("\n")}`;
  });
  const merged = pages.join("\n\n");
  if (!merged.trim()) {
    return {
      kind: "unknown",
      reason: "لم نتمكن من قراءة نص الملف من PDF — قد يكون ممسوحًا ضوئيًا. جرّب رفعه كصورة.",
    };
  }
  const out = await callGroq(
    TEXT_MODEL,
    [
      { role: "system", content: DETECTION_PROMPT },
      {
        role: "user",
        content: `Below is text extracted from a PDF with the original spatial layout preserved (each line is a row on the page; consecutive items separated by spaces are columns within that row).\n\n${merged}`,
      },
    ],
    { jsonMode: true }
  );
  return normalize(extractJson(out));
}

export async function extractFromXlsx(buffer: Buffer): Promise<DraftEnvelope> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `### Sheet: ${name}\n${csv}`;
  }).join("\n\n");
  const out = await callGroq(
    TEXT_MODEL,
    [
      { role: "system", content: DETECTION_PROMPT },
      {
        role: "user",
        content: `Below is the content of an XLSX file exported to CSV (one block per sheet).\n\n${sheets}`,
      },
    ],
    { jsonMode: true }
  );
  return normalize(extractJson(out));
}

// Human-readable summary that goes into the chat bubble — gives the owner
// a sanity check before confirming.
export function buildPreview(env: DraftEnvelope): string {
  const sum = (xs: number[]) => xs.reduce((s, n) => s + n, 0);
  switch (env.kind) {
    case "purchase_invoice": {
      const { supplier, items, totalAmount, invoiceNumber, invoiceDate } = env.data;
      const computed = sum(items.map((i) => i.qty * i.unitCost));
      const total = totalAmount ?? computed;
      const lines = [
        "📦 فاتورة شراء من مورد",
        `• المورد: ${supplier.name ?? "غير محدد"}${supplier.phone ? " · " + supplier.phone : ""}`,
        `• عدد الأصناف: ${items.length}`,
        `• الإجمالي: ₪${total.toFixed(2)}`,
      ];
      if (invoiceNumber) lines.push(`• رقم الفاتورة: ${invoiceNumber}`);
      if (invoiceDate) lines.push(`• التاريخ: ${invoiceDate}`);
      if (items.length === 0) {
        lines.push("", "⚠ لم أتعرّف على أي أصناف. لا يمكن الاستيراد.");
      } else {
        lines.push("", "أول 3 أصناف:");
        items.slice(0, 3).forEach((i) => {
          lines.push(`  - ${i.name} · ${i.qty} × ₪${i.unitCost.toFixed(2)}`);
        });
        if (items.length > 3) lines.push(`  ... و ${items.length - 3} صنف آخر`);
      }
      return lines.join("\n");
    }
    case "debts": {
      const { rows } = env.data;
      const total = sum(rows.map((r) => r.amount));
      const lines = [
        "💸 قائمة ديون عملاء",
        `• عدد العملاء: ${rows.length}`,
        `• إجمالي الديون: ₪${total.toFixed(2)}`,
      ];
      if (rows.length === 0) {
        lines.push("", "⚠ لم أتعرّف على أي صف. لا يمكن الاستيراد.");
      } else {
        lines.push("", "أول 3 ديون:");
        rows.slice(0, 3).forEach((r) => {
          lines.push(`  - ${r.customerName} · ₪${r.amount.toFixed(2)}${r.dueDate ? " · يستحق " + r.dueDate : ""}`);
        });
        if (rows.length > 3) lines.push(`  ... و ${rows.length - 3} صف آخر`);
      }
      return lines.join("\n");
    }
    case "customers": {
      const { rows } = env.data;
      const lines = [
        "👥 قائمة عملاء",
        `• عدد العملاء: ${rows.length}`,
      ];
      if (rows.length === 0) {
        lines.push("", "⚠ لم أتعرّف على أي اسم. لا يمكن الاستيراد.");
      } else {
        lines.push("", "أول 3 عملاء:");
        rows.slice(0, 3).forEach((r) => {
          lines.push(`  - ${r.name}${r.phone ? " · " + r.phone : ""}`);
        });
        if (rows.length > 3) lines.push(`  ... و ${rows.length - 3} عميل آخر`);
      }
      return lines.join("\n");
    }
    case "products": {
      const { rows } = env.data;
      const stockValue = sum(rows.map((r) => (r.costPrice ?? 0) * r.stockQty));
      const lines = [
        "🛒 قائمة منتجات",
        `• عدد المنتجات: ${rows.length}`,
      ];
      if (stockValue > 0) lines.push(`• قيمة المخزون المبدئي: ₪${stockValue.toFixed(2)}`);
      if (rows.length === 0) {
        lines.push("", "⚠ لم أتعرّف على أي منتج. لا يمكن الاستيراد.");
      } else {
        lines.push("", "أول 3 منتجات:");
        rows.slice(0, 3).forEach((r) => {
          lines.push(`  - ${r.name} · بيع ₪${r.sellPrice.toFixed(2)} · مخزون ${r.stockQty}`);
        });
        if (rows.length > 3) lines.push(`  ... و ${rows.length - 3} منتج آخر`);
      }
      return lines.join("\n");
    }
    case "unknown":
    default:
      return `❓ لم أتمكن من تحديد نوع الملف.\n${env.reason}`;
  }
}

export function envelopeIsImportable(env: DraftEnvelope): boolean {
  if (env.kind === "unknown") return false;
  if (env.kind === "purchase_invoice") return env.data.items.length > 0;
  return env.data.rows.length > 0;
}
