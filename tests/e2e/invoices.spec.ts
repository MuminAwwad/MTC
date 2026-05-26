import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupProduct, cancelInvoice } from "./helpers";

test.use({ storageState: AUTH_FILE });

async function stockOf(request: APIRequestContext, productId: string): Promise<number> {
  const list = await (await request.get("/api/products?all=true")).json();
  return list.find((p: { id: string }) => p.id === productId)?.stockQty ?? -1;
}

test.describe("Invoice lifecycle", () => {
  test("cash invoice: fully paid → PAID, no debt, stock decremented", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INV");
    let customerId = "";
    let productId = "";
    let invoiceId = "";
    try {
      customerId = (await (await request.post("/api/customers", { data: { name: `${label}-c`, phone: uniquePhone() } })).json()).id;
      productId = (await (await request.post("/api/products", { data: { name: `${label}-p`, costPrice: 20, sellPrice: 50, stockQty: 10 } })).json()).id;

      const inv = await request.post("/api/invoices", {
        data: { customerId, items: [{ productId, name: `${label}-p`, qty: 1, unitPrice: 50 }], status: "ISSUED", paidAmount: 50 },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      const body = await inv.json();
      invoiceId = body.id;
      expect(body.status).toBe("PAID");

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(detail.debts.length).toBe(0);
      expect(await stockOf(request, productId)).toBe(9);
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("draft → issue: stock and debt only move on issue", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INVD");
    let customerId = "";
    let productId = "";
    let invoiceId = "";
    try {
      customerId = (await (await request.post("/api/customers", { data: { name: `${label}-c`, phone: uniquePhone() } })).json()).id;
      productId = (await (await request.post("/api/products", { data: { name: `${label}-p`, costPrice: 20, sellPrice: 50, stockQty: 10 } })).json()).id;

      const inv = await request.post("/api/invoices", {
        data: { customerId, items: [{ productId, name: `${label}-p`, qty: 2, unitPrice: 50 }], status: "DRAFT", paidAmount: 0 },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      invoiceId = (await inv.json()).id;

      // draft: nothing moved
      expect((await (await request.get(`/api/invoices/${invoiceId}`)).json()).status).toBe("DRAFT");
      expect(await stockOf(request, productId)).toBe(10);
      expect((await (await request.get(`/api/invoices/${invoiceId}`)).json()).debts.length).toBe(0);

      // issue → stock decrements, debt opens for the full unpaid total
      const issue = await request.patch(`/api/invoices/${invoiceId}`, { data: { status: "ISSUED" } });
      expect(issue.status(), await issue.text()).toBe(200);

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(detail.status).toBe("ISSUED");
      expect(await stockOf(request, productId)).toBe(8);
      expect(detail.debts.length).toBe(1);
      expect(Number(detail.debts[0].amount)).toBe(100);
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("cancel restores stock and voids linked debts", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INVC");
    let customerId = "";
    let productId = "";
    let invoiceId = "";
    try {
      customerId = (await (await request.post("/api/customers", { data: { name: `${label}-c`, phone: uniquePhone() } })).json()).id;
      productId = (await (await request.post("/api/products", { data: { name: `${label}-p`, costPrice: 20, sellPrice: 50, stockQty: 10 } })).json()).id;

      const inv = await request.post("/api/invoices", {
        data: { customerId, items: [{ productId, name: `${label}-p`, qty: 4, unitPrice: 50 }], status: "ISSUED", paidAmount: 0 },
      });
      invoiceId = (await inv.json()).id;
      expect(await stockOf(request, productId)).toBe(6);

      const cancel = await request.patch(`/api/invoices/${invoiceId}`, { data: { status: "CANCELLED" } });
      expect(cancel.status(), await cancel.text()).toBe(200);

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(detail.status).toBe("CANCELLED");
      expect(detail.debts.length).toBe(0); // voided
      expect(await stockOf(request, productId)).toBe(10); // restored
    } finally {
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("issuing more than available stock is rejected (409)", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INVS");
    let customerId = "";
    let productId = "";
    try {
      customerId = (await (await request.post("/api/customers", { data: { name: `${label}-c`, phone: uniquePhone() } })).json()).id;
      productId = (await (await request.post("/api/products", { data: { name: `${label}-p`, costPrice: 20, sellPrice: 50, stockQty: 2 } })).json()).id;

      const inv = await request.post("/api/invoices", {
        data: { customerId, items: [{ productId, name: `${label}-p`, qty: 5, unitPrice: 50 }], status: "ISSUED", paidAmount: 0 },
      });
      expect(inv.status()).toBe(409);
      // stock untouched
      expect(await stockOf(request, productId)).toBe(2);
    } finally {
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });
});
