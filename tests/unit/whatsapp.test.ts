import { describe, it, expect } from "vitest";
import { buildInvoiceWhatsAppUrl, buildInvoiceWhatsAppMessage } from "@/lib/whatsapp";

const baseInput = {
  invoiceNumber: "MTC-2026-0001",
  customerName: "أحمد",
  customerPhone: "0599880618",
  currency: "ILS" as const,
  total: 150,
  remaining: 50,
};

describe("buildInvoiceWhatsAppUrl", () => {
  it("returns a wa.me URL", () => {
    const url = buildInvoiceWhatsAppUrl(baseInput);
    expect(url.startsWith("https://wa.me/")).toBe(true);
  });

  it("normalizes Palestinian local phone (0…) to international 970…", () => {
    const url = buildInvoiceWhatsAppUrl(baseInput);
    expect(url).toContain("wa.me/970599880618");
  });

  it("falls back to phone-less wa.me/ when phone missing", () => {
    const url = buildInvoiceWhatsAppUrl({ ...baseInput, customerPhone: null });
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("strips non-digit characters from phone", () => {
    const url = buildInvoiceWhatsAppUrl({ ...baseInput, customerPhone: "059-988-0618" });
    expect(url).toContain("wa.me/970599880618");
  });

  it("includes invoice number in message", () => {
    const url = buildInvoiceWhatsAppUrl(baseInput);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text).toContain("MTC-2026-0001");
  });

  it("uses correct currency symbol for ILS", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl(baseInput).split("?text=")[1]
    );
    expect(text).toContain("₪150.00");
    expect(text).toContain("₪50.00");
  });

  it("uses $ for USD", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl({ ...baseInput, currency: "USD" }).split("?text=")[1]
    );
    expect(text).toContain("$150.00");
  });

  it("uses JD for JOD", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl({ ...baseInput, currency: "JOD" }).split("?text=")[1]
    );
    expect(text).toContain("JD150.00");
  });

  it("coerces string totals to numbers", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl({ ...baseInput, total: "200.5", remaining: "10" }).split(
        "?text="
      )[1]
    );
    expect(text).toContain("₪200.50");
    expect(text).toContain("₪10.00");
  });

  it("treats non-numeric total as 0", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl({ ...baseInput, total: "abc" as unknown as number, remaining: 0 }).split(
        "?text="
      )[1]
    );
    expect(text).toContain("₪0.00");
  });

  it("includes the customer name in the greeting", () => {
    const text = decodeURIComponent(
      buildInvoiceWhatsAppUrl(baseInput).split("?text=")[1]
    );
    expect(text).toContain("مرحبًا أحمد");
  });
});

describe("buildInvoiceWhatsAppMessage", () => {
  it("does not embed any URL — the PDF travels via the share sheet now", () => {
    const msg = buildInvoiceWhatsAppMessage(baseInput);
    expect(msg).not.toMatch(/https?:\/\//);
  });

  it("mentions the attached invoice", () => {
    const msg = buildInvoiceWhatsAppMessage(baseInput);
    expect(msg).toContain("مرفق");
    expect(msg).toContain("MTC-2026-0001");
  });
});
