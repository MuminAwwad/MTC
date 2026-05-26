import { test, expect } from "@playwright/test";
import {
  AUTH_FILE, tag, uniquePhone,
  cleanupCustomer, cleanupSupplier, cleanupProduct, cleanupExpense, cleanupTicket,
} from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("Core CRUD workflows", () => {
  test("customer: create → list → delete", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("CUS")}-c`;
    let id = "";
    try {
      const c = await request.post("/api/customers", { data: { name, phone: uniquePhone(), address: "نابلس" } });
      expect(c.status(), await c.text()).toBe(201);
      id = (await c.json()).id;

      const list = await (await request.get(`/api/customers?search=${encodeURIComponent(name)}`)).json();
      expect((list.data ?? []).some((x: { id: string }) => x.id === id)).toBeTruthy();

      const del = await request.delete(`/api/customers/${id}`);
      expect(del.status()).toBeLessThan(400);
    } finally {
      if (id) await cleanupCustomer(request, id);
    }
  });

  test("supplier: create → list → delete", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("SUP")}-s`;
    let id = "";
    try {
      const s = await request.post("/api/suppliers", { data: { name, phone: uniquePhone(), company: "ACME" } });
      expect(s.status(), await s.text()).toBe(201);
      id = (await s.json()).id;
      const list = await (await request.get(`/api/suppliers?search=${encodeURIComponent(name)}`)).json();
      expect((list.data ?? []).some((x: { id: string }) => x.id === id)).toBeTruthy();
    } finally {
      if (id) await cleanupSupplier(request, id);
    }
  });

  test("product: create → stock IN/OUT/ADJUSTMENT → delete", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("PRD")}-p`;
    let id = "";
    try {
      const p = await request.post("/api/products", { data: { name, costPrice: 30, sellPrice: 60, stockQty: 10 } });
      expect(p.status(), await p.text()).toBe(201);
      id = (await p.json()).id;

      const inMove = await request.post(`/api/products/${id}/stock`, { data: { type: "IN", qty: 5 } });
      expect(inMove.status(), await inMove.text()).toBe(201);
      expect((await inMove.json()).newStockQty).toBe(15);

      const outMove = await request.post(`/api/products/${id}/stock`, { data: { type: "OUT", qty: 3 } });
      expect(outMove.status()).toBe(201);
      expect((await outMove.json()).newStockQty).toBe(12);

      const adj = await request.post(`/api/products/${id}/stock`, { data: { type: "ADJUSTMENT", qty: 7 } });
      expect(adj.status()).toBe(201);
      expect((await adj.json()).newStockQty).toBe(7);

      // can't remove more than is in stock
      const over = await request.post(`/api/products/${id}/stock`, { data: { type: "OUT", qty: 999 } });
      expect(over.status()).toBe(409);
    } finally {
      if (id) await cleanupProduct(request, id);
    }
  });

  test("expense: create → delete", async ({ request }) => {
    test.setTimeout(60_000);
    let id = "";
    try {
      const e = await request.post("/api/expenses", {
        data: { amount: 42.5, description: `${tag("EXP")}-e`, date: "2026-05-20" },
      });
      expect(e.status(), await e.text()).toBe(201);
      id = (await e.json()).id;
      expect(Number((await (await request.get(`/api/expenses`)).json()).totalAmount)).toBeGreaterThanOrEqual(0);
    } finally {
      if (id) await cleanupExpense(request, id);
    }
  });

  test("ticket: create → advance status → cancel → delete", async ({ request }) => {
    test.setTimeout(60_000);
    const label = tag("TKT");
    let customerId = "";
    let ticketId = "";
    try {
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      customerId = (await c.json()).id;

      const t = await request.post("/api/tickets", {
        data: { customerId, deviceType: "MOBILE", problemDescription: `${label} لا يشحن` },
      });
      expect(t.status(), await t.text()).toBe(201);
      const ticket = await t.json();
      ticketId = ticket.id;
      expect(ticket.status).toBe("RECEIVED");

      const adv = await request.patch(`/api/tickets/${ticketId}`, { data: { status: "DIAGNOSING" } });
      expect(adv.status(), await adv.text()).toBe(200);
      expect((await adv.json()).status).toBe("DIAGNOSING");

      // illegal transition rejected (DIAGNOSING → DELIVERED isn't allowed)
      const bad = await request.patch(`/api/tickets/${ticketId}`, { data: { status: "DELIVERED" } });
      expect(bad.status()).toBe(400);
    } finally {
      // DELETE only allows RECEIVED/CANCELLED tickets — cancel first.
      if (ticketId) {
        await request.patch(`/api/tickets/${ticketId}`, { data: { status: "CANCELLED" } }).catch(() => {});
        await cleanupTicket(request, ticketId);
      }
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });
});
