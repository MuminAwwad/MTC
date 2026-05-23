import type { Currency } from "@prisma/client";
import { SHOP_INFO } from "./constants";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ILS: "₪",
  USD: "$",
  JOD: "JD",
};

interface InvoiceMessageInput {
  invoiceNumber: string;
  customerName: string;
  currency: Currency;
  total: number | string;
  remaining: number | string;
  /** Public link to the PDF — included in the message body when present. */
  pdfUrl?: string | null;
}

/** Message body. If pdfUrl is given the customer can open the invoice straight from WhatsApp. */
export function buildInvoiceWhatsAppMessage(input: InvoiceMessageInput): string {
  const sym = CURRENCY_SYMBOLS[input.currency];
  const total = Number(input.total) || 0;
  const remaining = Number(input.remaining) || 0;
  const lines = [
    `مرحبًا ${input.customerName}،`,
    "",
    `فاتورتك رقم: ${input.invoiceNumber}`,
    `الإجمالي: ${sym}${total.toFixed(2)}`,
    `المتبقي: ${sym}${remaining.toFixed(2)}`,
  ];
  if (input.pdfUrl) {
    lines.push("", "لعرض وتحميل الفاتورة:", input.pdfUrl);
  }
  lines.push("", `شكرًا لتعاملكم مع ${SHOP_INFO.nameAr}`);
  return lines.join("\n");
}

/** Normalize a local Palestinian number "0XXXXXXXXX" → "970XXXXXXXXX"; pass through international. */
export function normalizeWhatsAppNumber(phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.startsWith("0") ? `970${digits.slice(1)}` : digits;
}

/** Click-to-chat wa.me URL. Cannot pre-attach files — text only. */
export function buildInvoiceWhatsAppUrl(input: InvoiceMessageInput & {
  customerPhone?: string | null;
}): string {
  const text = encodeURIComponent(buildInvoiceWhatsAppMessage(input));
  const normalized = normalizeWhatsAppNumber(input.customerPhone);
  return normalized ? `https://wa.me/${normalized}?text=${text}` : `https://wa.me/?text=${text}`;
}
