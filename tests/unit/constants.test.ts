import { describe, it, expect } from "vitest";
import {
  INVOICE_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  DEVICE_TYPE_LABELS,
  CURRENCY_LABELS,
  DEBT_STATUS_LABELS,
  STOCK_MOVEMENT_LABELS,
  TICKET_FLOW,
  ITEMS_PER_PAGE,
} from "@/lib/constants";

describe("INVOICE_STATUS_LABELS", () => {
  it("has Arabic labels for all statuses", () => {
    expect(INVOICE_STATUS_LABELS.DRAFT).toBe("مسودة");
    expect(INVOICE_STATUS_LABELS.ISSUED).toBe("مُصدرة");
    expect(INVOICE_STATUS_LABELS.PAID).toBe("مدفوعة");
    expect(INVOICE_STATUS_LABELS.PARTIAL).toBe("مدفوعة جزئيًا");
    expect(INVOICE_STATUS_LABELS.CANCELLED).toBe("ملغاة");
  });
});

describe("TICKET_STATUS_LABELS", () => {
  it("covers all 7 ticket statuses", () => {
    const statuses = ["RECEIVED", "DIAGNOSING", "IN_REPAIR", "WAITING_PARTS", "READY", "DELIVERED", "CANCELLED"] as const;
    statuses.forEach((s) => {
      expect(TICKET_STATUS_LABELS[s]).toBeTruthy();
    });
  });
});

describe("TICKET_FLOW", () => {
  it("starts with RECEIVED and ends with DELIVERED", () => {
    expect(TICKET_FLOW[0]).toBe("RECEIVED");
    expect(TICKET_FLOW[TICKET_FLOW.length - 1]).toBe("DELIVERED");
  });

  it("does not include CANCELLED (non-linear status)", () => {
    expect(TICKET_FLOW).not.toContain("CANCELLED");
  });

  it("has correct order", () => {
    expect(TICKET_FLOW).toEqual([
      "RECEIVED",
      "DIAGNOSING",
      "IN_REPAIR",
      "WAITING_PARTS",
      "READY",
      "DELIVERED",
    ]);
  });
});

describe("TICKET_PRIORITY_LABELS", () => {
  it("has Arabic labels for all priorities", () => {
    expect(TICKET_PRIORITY_LABELS.LOW).toBe("منخفضة");
    expect(TICKET_PRIORITY_LABELS.NORMAL).toBe("عادية");
    expect(TICKET_PRIORITY_LABELS.HIGH).toBe("عالية");
    expect(TICKET_PRIORITY_LABELS.URGENT).toBe("عاجلة");
  });
});

describe("CURRENCY_LABELS", () => {
  it("includes symbol in each label", () => {
    expect(CURRENCY_LABELS.ILS).toContain("₪");
    expect(CURRENCY_LABELS.USD).toContain("$");
    expect(CURRENCY_LABELS.JOD).toContain("JD");
  });
});

describe("DEBT_STATUS_LABELS", () => {
  it("covers all debt statuses", () => {
    expect(DEBT_STATUS_LABELS.PENDING).toBeTruthy();
    expect(DEBT_STATUS_LABELS.PARTIAL).toBeTruthy();
    expect(DEBT_STATUS_LABELS.PAID).toBeTruthy();
  });
});

describe("STOCK_MOVEMENT_LABELS", () => {
  it("covers IN, OUT, ADJUSTMENT", () => {
    expect(STOCK_MOVEMENT_LABELS.IN).toBeTruthy();
    expect(STOCK_MOVEMENT_LABELS.OUT).toBeTruthy();
    expect(STOCK_MOVEMENT_LABELS.ADJUSTMENT).toBeTruthy();
  });
});

describe("DEVICE_TYPE_LABELS", () => {
  it("covers all device types", () => {
    ["MOBILE", "LAPTOP", "DESKTOP", "TABLET", "OTHER"].forEach((t) => {
      expect(DEVICE_TYPE_LABELS[t as keyof typeof DEVICE_TYPE_LABELS]).toBeTruthy();
    });
  });
});

describe("ITEMS_PER_PAGE", () => {
  it("is a positive integer", () => {
    expect(ITEMS_PER_PAGE).toBeGreaterThan(0);
    expect(Number.isInteger(ITEMS_PER_PAGE)).toBe(true);
  });
});
