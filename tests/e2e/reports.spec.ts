import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("Reports API", () => {
  test("P&L report shape", async ({ request }) => {
    const r = await request.get("/api/reports?type=pl");
    expect(r.status(), await r.text()).toBe(200);
    const b = await r.json();
    expect(b.type).toBe("pl");
    expect(b.revenue).toHaveProperty("total");
    expect(b.revenue).toHaveProperty("paid");
    expect(b.revenue).toHaveProperty("outstanding");
    expect(b.expenses).toHaveProperty("total");
    expect(b).toHaveProperty("netProfit");
    expect(b).toHaveProperty("profitMargin");
  });

  test("sales report shape", async ({ request }) => {
    const r = await request.get("/api/reports?type=sales");
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.type).toBe("sales");
    expect(Array.isArray(b.byDay)).toBeTruthy();
    expect(Array.isArray(b.topCustomers)).toBeTruthy();
  });

  test("inventory report shape", async ({ request }) => {
    const r = await request.get("/api/reports?type=inventory");
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.type).toBe("inventory");
    expect(Array.isArray(b.lowStock)).toBeTruthy();
    expect(b.summary).toHaveProperty("inventoryValue");
    expect(b.summary).toHaveProperty("lowStockCount");
  });

  test("debts aging report shape", async ({ request }) => {
    const r = await request.get("/api/reports?type=debts");
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(b.type).toBe("debts");
    expect(Array.isArray(b.debts)).toBeTruthy();
    expect(b.buckets).toBeTruthy();
  });

  test("invalid report type is rejected", async ({ request }) => {
    const r = await request.get("/api/reports?type=bogus");
    expect(r.status()).toBe(400);
  });

  test("date range is accepted for pl", async ({ request }) => {
    const r = await request.get("/api/reports?type=pl&dateFrom=2026-01-01&dateTo=2026-12-31");
    expect(r.status()).toBe(200);
    expect((await r.json()).type).toBe("pl");
  });
});
