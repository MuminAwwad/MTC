import type { Currency } from "@prisma/client";
import { SHOP_INFO } from "./constants";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ILS: "₪",
  USD: "$",
  JOD: "JD",
};

export function buildInvoiceWhatsAppUrl(input: {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string | null;
  currency: Currency;
  total: number | string;
  remaining: number | string;
}): string {
  const sym = CURRENCY_SYMBOLS[input.currency];
  const total = Number(input.total) || 0;
  const remaining = Number(input.remaining) || 0;
  const message = [
    `مرحبًا ${input.customerName}،`,
    "",
    `فاتورة رقم: ${input.invoiceNumber}`,
    `الإجمالي: ${sym}${total.toFixed(2)}`,
    `المتبقي: ${sym}${remaining.toFixed(2)}`,
    "",
    `شكرًا لتعاملكم مع ${SHOP_INFO.nameAr}`,
  ].join("\n");
  const text = encodeURIComponent(message);
  // Normalize to Palestinian international format: local "0XXXXXXXXX" → "970XXXXXXXXX".
  const digits = (input.customerPhone ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `970${digits.slice(1)}` : digits;
  return normalized ? `https://wa.me/${normalized}?text=${text}` : `https://wa.me/?text=${text}`;
}
