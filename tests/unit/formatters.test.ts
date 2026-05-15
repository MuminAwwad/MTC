import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPhone,
  toNumber,
  getCurrencySymbol,
} from "@/lib/formatters";

describe("formatCurrency", () => {
  it("formats ILS correctly", () => {
    expect(formatCurrency(100, "ILS")).toBe("₪ 100.00");
  });

  it("formats USD correctly", () => {
    expect(formatCurrency(50.5, "USD")).toBe("$ 50.50");
  });

  it("formats JOD correctly", () => {
    expect(formatCurrency(25, "JOD")).toBe("JD 25.00");
  });

  it("adds thousands separator", () => {
    expect(formatCurrency(1234567, "ILS")).toBe("₪ 1,234,567.00");
  });

  it("defaults to ILS when currency omitted", () => {
    expect(formatCurrency(10)).toBe("₪ 10.00");
  });

  it("handles null", () => {
    expect(formatCurrency(null)).toBe("₪ 0.00");
  });

  it("handles undefined", () => {
    expect(formatCurrency(undefined)).toBe("₪ 0.00");
  });

  it("handles string input", () => {
    expect(formatCurrency("99.9", "ILS")).toBe("₪ 99.90");
  });

  it("handles NaN string", () => {
    expect(formatCurrency("abc")).toBe("₪ 0.00");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("₪ 0.00");
  });
});

describe("getCurrencySymbol", () => {
  it("returns correct symbols", () => {
    expect(getCurrencySymbol("ILS")).toBe("₪");
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("JOD")).toBe("JD");
  });
});

describe("formatDate", () => {
  it("formats a Date object as DD/MM/YYYY", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("05/01/2026");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2026-05-15")).toBe("15/05/2026");
  });

  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("returns dash for invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("-");
  });
});

describe("formatDateTime", () => {
  it("includes time portion", () => {
    const d = new Date(2026, 4, 15, 9, 5);
    expect(formatDateTime(d)).toBe("15/05/2026 09:05");
  });

  it("returns dash for null", () => {
    expect(formatDateTime(null)).toBe("-");
  });
});

describe("formatNumber", () => {
  it("formats integers with locale separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("returns 0 for null", () => {
    expect(formatNumber(null)).toBe("0");
  });

  it("returns 0 for undefined", () => {
    expect(formatNumber(undefined)).toBe("0");
  });

  it("handles string input", () => {
    expect(formatNumber("500")).toBe("500");
  });
});

describe("formatPhone", () => {
  it("formats a 10-digit number", () => {
    expect(formatPhone("0599880618")).toBe("0599-880-618");
  });

  it("returns dash for null", () => {
    expect(formatPhone(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatPhone(undefined)).toBe("-");
  });
});

describe("toNumber", () => {
  it("converts string to number", () => {
    expect(toNumber("3.14")).toBe(3.14);
  });

  it("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(toNumber(undefined)).toBe(0);
  });

  it("returns 0 for non-numeric string", () => {
    expect(toNumber("abc")).toBe(0);
  });

  it("passes through a number unchanged", () => {
    expect(toNumber(42)).toBe(42);
  });
});
