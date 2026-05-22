import { test, expect } from "@playwright/test";

// These read endpoints don't have auth guards in their handlers, but proxy.ts
// blanket-401s any unauthenticated /api/* request, so we run this block with
// the session captured by global-setup. We only verify response shape and
// HTTP semantics — no DB writes.

test.describe("Public read APIs", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("GET /api/customers returns JSON", async ({ request }) => {
    const res = await request.get("/api/customers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("GET /api/suppliers returns paginated list", async ({ request }) => {
    const res = await request.get("/api/suppliers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("totalPages");
  });

  test("GET /api/products returns paginated list", async ({ request }) => {
    const res = await request.get("/api/products");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("totalPages");
    expect(body).toHaveProperty("lowStockCount");
  });

  test("GET /api/products?all=true returns array (no pagination)", async ({ request }) => {
    const res = await request.get("/api/products?all=true");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/categories returns array", async ({ request }) => {
    const res = await request.get("/api/categories");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/expense-categories returns array", async ({ request }) => {
    const res = await request.get("/api/expense-categories");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/invoices returns invoices + summary", async ({ request }) => {
    const res = await request.get("/api/invoices");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("invoices");
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("total");
    expect(body.summary).toHaveProperty("paid");
    expect(body.summary).toHaveProperty("remaining");
  });

  test("GET /api/debts returns debts + totalOutstanding", async ({ request }) => {
    const res = await request.get("/api/debts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("debts");
    expect(body).toHaveProperty("totalOutstanding");
    expect(typeof body.totalOutstanding).toBe("number");
  });

  test("GET /api/expenses returns expenses + totalAmount", async ({ request }) => {
    const res = await request.get("/api/expenses");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("expenses");
    expect(body).toHaveProperty("totalAmount");
  });

  test("GET /api/tickets returns paginated tickets", async ({ request }) => {
    const res = await request.get("/api/tickets");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tickets");
    expect(body).toHaveProperty("pageCount");
  });
});

test.describe("Write endpoints require auth", () => {
  test("POST /api/products without session returns 401", async ({ request }) => {
    const res = await request.post("/api/products", {
      data: { name: "should-fail", costPrice: 1, sellPrice: 2 },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/expenses without session returns 401", async ({ request }) => {
    const res = await request.post("/api/expenses", {
      data: { amount: 100 },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/tickets without session returns 401", async ({ request }) => {
    const res = await request.post("/api/tickets", {
      data: {
        customerId: "x",
        deviceType: "MOBILE",
        problemDescription: "test",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/users/me without session returns 401", async ({ request }) => {
    const res = await request.get("/api/users/me");
    expect(res.status()).toBe(401);
  });
});
