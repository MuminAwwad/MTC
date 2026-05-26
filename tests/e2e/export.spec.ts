import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

const TYPES = ["customers", "suppliers", "invoices", "debts", "expenses", "products", "tickets"] as const;

test.describe("Export API", () => {
  for (const type of TYPES) {
    test(`GET /api/export?type=${type} returns a well-formed dataset`, async ({ request }) => {
      test.setTimeout(60_000);
      const r = await request.get(`/api/export?type=${type}`);
      expect(r.status(), await r.text()).toBe(200);
      const body = await r.json();
      expect(typeof body.title).toBe("string");
      expect(body.title.length).toBeGreaterThan(0);
      expect(typeof body.filename).toBe("string");
      expect(Array.isArray(body.columns)).toBeTruthy();
      expect(body.columns.length).toBeGreaterThan(0);
      // every column has key + header
      for (const col of body.columns) {
        expect(typeof col.key).toBe("string");
        expect(typeof col.header).toBe("string");
      }
      expect(Array.isArray(body.rows)).toBeTruthy();
    });
  }

  test("unknown type is rejected with 400", async ({ request }) => {
    const r = await request.get("/api/export?type=bogus");
    expect(r.status()).toBe(400);
  });

  test("missing type is rejected with 400", async ({ request }) => {
    const r = await request.get("/api/export");
    expect(r.status()).toBe(400);
  });
});
