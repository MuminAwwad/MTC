import { type Currency } from "@prisma/client";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ILS: "₪",
  USD: "$",
  JOD: "JD",
};

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: Currency = "ILS"
): string {
  if (amount === null || amount === undefined) return `${CURRENCY_SYMBOLS[currency]} 0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${CURRENCY_SYMBOLS[currency]} 0.00`;
  return `${CURRENCY_SYMBOLS[currency]} ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency];
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${dateStr} ${hours}:${mins}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  return num.toLocaleString("en");
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  return phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1-$2-$3");
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(n) ? 0 : n;
}
