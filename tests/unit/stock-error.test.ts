import { describe, it, expect } from "vitest";
import { InsufficientStockError } from "@/lib/stock";

describe("InsufficientStockError", () => {
  it("is an instance of Error", () => {
    const err = new InsufficientStockError("منتج", 0, 5);
    expect(err).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    const err = new InsufficientStockError("منتج", 0, 5);
    expect(err.name).toBe("InsufficientStockError");
  });

  it("captures productName, available, requested", () => {
    const err = new InsufficientStockError("شاحن سامسونج", 2, 5);
    expect(err.productName).toBe("شاحن سامسونج");
    expect(err.available).toBe(2);
    expect(err.requested).toBe(5);
  });

  it("renders the Arabic message with available + requested", () => {
    const err = new InsufficientStockError("شاحن", 1, 3);
    expect(err.message).toContain("شاحن");
    expect(err.message).toContain("1");
    expect(err.message).toContain("3");
  });

  it("is throwable and catchable as Error", () => {
    expect(() => {
      throw new InsufficientStockError("X", 0, 1);
    }).toThrow(Error);
  });

  it("can be narrowed via instanceof", () => {
    let caught: unknown;
    try {
      throw new InsufficientStockError("X", 0, 1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InsufficientStockError);
  });
});
