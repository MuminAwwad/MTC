// Format detection + parsing for catalog exports: CSV, Excel (.xlsx), or JSON.
// Ported from the storefront repo's lib/import/parse.ts. All three reduce to
// an array of raw rows that lib/store/mapping.ts normalizes.

import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedFormat = "csv" | "xlsx" | "json";

export interface ParseInput {
  /** Raw file bytes (uploads, fetched files). */
  buffer?: Buffer | Uint8Array;
  /** Raw text (JSON/CSV strings). */
  text?: string;
  filename?: string;
  contentType?: string;
}

export function detectFormat(input: ParseInput): ParsedFormat {
  const name = (input.filename ?? "").toLowerCase();
  const ct = (input.contentType ?? "").toLowerCase();
  if (name.endsWith(".json") || ct.includes("json")) return "json";
  if (name.endsWith(".csv") || ct.includes("csv")) return "csv";
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    ct.includes("spreadsheet") ||
    ct.includes("excel")
  )
    return "xlsx";
  // Fall back to sniffing text content.
  const t = input.text?.trimStart();
  if (t && (t.startsWith("[") || t.startsWith("{"))) return "json";
  return "csv";
}

function asText(input: ParseInput): string {
  if (input.text != null) return input.text;
  if (input.buffer) return Buffer.from(input.buffer).toString("utf8");
  return "";
}

export function parseInput(input: ParseInput): {
  rows: Record<string, unknown>[];
  format: ParsedFormat;
} {
  const format = detectFormat(input);

  if (format === "json") {
    const data = JSON.parse(asText(input)) as unknown;
    const rows = Array.isArray(data)
      ? (data as Record<string, unknown>[])
      : data && typeof data === "object" && Array.isArray((data as { products?: unknown }).products)
        ? ((data as { products: Record<string, unknown>[] }).products)
        : [data as Record<string, unknown>];
    return { rows, format };
  }

  if (format === "xlsx") {
    const wb = input.buffer
      ? XLSX.read(input.buffer, { type: "buffer" })
      : XLSX.read(asText(input), { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = sheet
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: undefined,
          raw: false,
        })
      : [];
    return { rows, format };
  }

  // CSV
  const parsed = Papa.parse<Record<string, unknown>>(asText(input), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { rows: parsed.data ?? [], format };
}
