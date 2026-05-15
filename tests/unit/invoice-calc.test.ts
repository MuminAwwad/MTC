import { describe, it, expect } from "vitest";

// Pure invoice calculation logic extracted from the POST /api/invoices handler
function calcInvoiceTotals(
  items: { qty: number; unitPrice: number; discount?: number }[],
  discountAmount: number,
  discountPercent: number,
  taxPercent: number,
  paidAmount: number
) {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.qty * item.unitPrice - (item.discount ?? 0);
  }, 0);

  const discAmt = discountPercent > 0 ? subtotal * (discountPercent / 100) : discountAmount;
  const taxableAmount = subtotal - discAmt;
  const taxAmount = taxPercent > 0 ? taxableAmount * (taxPercent / 100) : 0;
  const total = taxableAmount + taxAmount;
  const paid = Math.min(paidAmount, total);
  const remaining = total - paid;
  return { subtotal, discAmt, taxAmount, total, paid, remaining };
}

function resolveInvoiceStatus(
  status: "DRAFT" | "ISSUED",
  paid: number,
  total: number
): "DRAFT" | "ISSUED" | "PAID" | "PARTIAL" {
  if (status !== "ISSUED") return "DRAFT";
  if (paid >= total) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "ISSUED";
}

describe("invoice totals calculation", () => {
  it("calculates subtotal from multiple items", () => {
    const items = [
      { qty: 2, unitPrice: 100 },
      { qty: 1, unitPrice: 50 },
    ];
    const { subtotal } = calcInvoiceTotals(items, 0, 0, 0, 0);
    expect(subtotal).toBe(250);
  });

  it("applies item-level discount", () => {
    const items = [{ qty: 1, unitPrice: 200, discount: 20 }];
    const { subtotal } = calcInvoiceTotals(items, 0, 0, 0, 0);
    expect(subtotal).toBe(180);
  });

  it("applies fixed discount amount", () => {
    const items = [{ qty: 1, unitPrice: 200 }];
    const { total } = calcInvoiceTotals(items, 30, 0, 0, 0);
    expect(total).toBe(170);
  });

  it("applies percent discount over fixed when percent > 0", () => {
    const items = [{ qty: 1, unitPrice: 200 }];
    const { discAmt, total } = calcInvoiceTotals(items, 50, 10, 0, 0);
    expect(discAmt).toBe(20);  // 10% of 200
    expect(total).toBe(180);
  });

  it("applies tax on post-discount amount", () => {
    const items = [{ qty: 1, unitPrice: 200 }];
    const { taxAmount, total } = calcInvoiceTotals(items, 0, 0, 16, 0);
    expect(taxAmount).toBeCloseTo(32);
    expect(total).toBeCloseTo(232);
  });

  it("clamps paid amount to total", () => {
    const items = [{ qty: 1, unitPrice: 100 }];
    const { paid, remaining } = calcInvoiceTotals(items, 0, 0, 0, 999);
    expect(paid).toBe(100);
    expect(remaining).toBe(0);
  });

  it("computes correct remaining when partially paid", () => {
    const items = [{ qty: 1, unitPrice: 100 }];
    const { remaining } = calcInvoiceTotals(items, 0, 0, 0, 40);
    expect(remaining).toBe(60);
  });
});

describe("invoice status resolution", () => {
  it("stays DRAFT when status is DRAFT regardless of payment", () => {
    expect(resolveInvoiceStatus("DRAFT", 100, 100)).toBe("DRAFT");
  });

  it("resolves to PAID when fully paid", () => {
    expect(resolveInvoiceStatus("ISSUED", 100, 100)).toBe("PAID");
  });

  it("resolves to PARTIAL when partially paid", () => {
    expect(resolveInvoiceStatus("ISSUED", 50, 100)).toBe("PARTIAL");
  });

  it("resolves to ISSUED when nothing paid", () => {
    expect(resolveInvoiceStatus("ISSUED", 0, 100)).toBe("ISSUED");
  });
});
