import { describe, it, expect } from "vitest";
import { ok } from "@/lib/api-response";

// Minimal fake matching the shape isDecimal() detects: toNumber(), toFixed(), and s/e/d props.
function fakeDecimal(value: number) {
  return {
    s: value < 0 ? -1 : 1,
    e: Math.floor(Math.log10(Math.abs(value || 1))),
    d: [Math.abs(value)],
    toNumber() {
      return value;
    },
    toFixed(n: number) {
      return value.toFixed(n);
    },
  };
}

async function readBody(res: Response): Promise<unknown> {
  return await res.json();
}

describe("ok() — Decimal conversion", () => {
  it("returns a NextResponse-shaped object with JSON body", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await readBody(res)).toEqual({ hello: "world" });
  });

  it("forwards init (status, headers)", async () => {
    const res = ok({ error: "nope" }, { status: 400 });
    expect(res.status).toBe(400);
  });

  it("converts a single top-level Decimal-like value to number", async () => {
    const res = ok({ amount: fakeDecimal(123.45) });
    const body = (await readBody(res)) as { amount: number };
    expect(body.amount).toBe(123.45);
    expect(typeof body.amount).toBe("number");
  });

  it("recursively converts Decimals inside arrays", async () => {
    const res = ok({
      items: [
        { price: fakeDecimal(10) },
        { price: fakeDecimal(20) },
      ],
    });
    const body = (await readBody(res)) as { items: { price: number }[] };
    expect(body.items.map((i) => i.price)).toEqual([10, 20]);
  });

  it("leaves Dates as ISO strings (via JSON serialization)", async () => {
    const d = new Date("2026-05-15T10:00:00.000Z");
    const res = ok({ at: d });
    const body = (await readBody(res)) as { at: string };
    expect(body.at).toBe("2026-05-15T10:00:00.000Z");
  });

  it("preserves null fields", async () => {
    const res = ok({ note: null });
    const body = (await readBody(res)) as { note: null };
    expect(body.note).toBeNull();
  });

  it("preserves plain numbers and strings", async () => {
    const res = ok({ qty: 5, name: "widget" });
    expect(await readBody(res)).toEqual({ qty: 5, name: "widget" });
  });

  it("handles deeply nested Decimals", async () => {
    const res = ok({
      invoice: {
        total: fakeDecimal(500),
        items: [{ unitPrice: fakeDecimal(50), total: fakeDecimal(250) }],
      },
    });
    const body = (await readBody(res)) as {
      invoice: { total: number; items: { unitPrice: number; total: number }[] };
    };
    expect(body.invoice.total).toBe(500);
    expect(body.invoice.items[0].unitPrice).toBe(50);
    expect(body.invoice.items[0].total).toBe(250);
  });

  it("does not crash on top-level null", async () => {
    const res = ok(null);
    expect(await readBody(res)).toBeNull();
  });
});
