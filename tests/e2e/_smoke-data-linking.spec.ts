import { test, expect } from "@playwright/test";

// One-off smoke test: walks the full create-and-link path through the public
// API + a few UI page-loads, asserting each FK actually resolves.
//
// Creates rows tagged with a "SMOKE-{ts}-" prefix so they're easy to spot
// and delete in the DB after. Drop this file when you no longer want it.

test.use({ storageState: "tests/e2e/.auth/user.json" });

test("data-linking smoke: customer → product → invoice → debt → ticket → repair invoice", async ({
  request,
  page,
}) => {
  // Cold Turbopack compiles for /api/tickets and /api/tickets/[id]/parts on
  // first hit can take several seconds each; default 30s isn't enough.
  test.setTimeout(120_000);
  const tag = `SMOKE-${Date.now()}`;
  const created: Record<string, string> = {};

  await test.step("create customer", async () => {
    const r = await request.post("/api/customers", {
      data: { name: `${tag}-customer`, phone: `9${Date.now().toString().slice(-9)}` },
    });
    expect(r.status(), await r.text()).toBe(201);
    const body = await r.json();
    created.customerId = body.id;
    expect(body.name).toBe(`${tag}-customer`);
  });

  await test.step("create supplier", async () => {
    const r = await request.post("/api/suppliers", {
      data: { name: `${tag}-supplier`, phone: `8${Date.now().toString().slice(-9)}` },
    });
    expect(r.status(), await r.text()).toBe(201);
    created.supplierId = (await r.json()).id;
  });

  await test.step("create category", async () => {
    const r = await request.post("/api/categories", { data: { name: `${tag}-category` } });
    expect(r.status(), await r.text()).toBe(201);
    created.categoryId = (await r.json()).id;
  });

  await test.step("create product linked to category + supplier", async () => {
    const r = await request.post("/api/products", {
      data: {
        name: `${tag}-product`,
        categoryId: created.categoryId,
        supplierId: created.supplierId,
        costPrice: 50,
        sellPrice: 100,
        stockQty: 10,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const body = await r.json();
    created.productId = body.id;
    // FK resolution: the product should round-trip with the same FK values
    expect(body.categoryId).toBe(created.categoryId);
    expect(body.supplierId).toBe(created.supplierId);
  });

  await test.step("GET /api/products?all=true returns product nested under category", async () => {
    const r = await request.get("/api/products?all=true");
    expect(r.status()).toBe(200);
    const list = await r.json();
    const found = list.find((p: { id: string }) => p.id === created.productId);
    expect(found, "newly created product missing from /api/products?all=true").toBeTruthy();
    expect(found.category?.id).toBe(created.categoryId);
  });

  await test.step("issue invoice (paid 60 of 100) → expect auto-debt + stock decrement", async () => {
    const r = await request.post("/api/invoices", {
      data: {
        customerId: created.customerId,
        items: [
          { productId: created.productId, name: `${tag}-product`, qty: 1, unitPrice: 100 },
        ],
        status: "ISSUED",
        paidAmount: 60,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const inv = await r.json();
    created.invoiceId = inv.id;
    expect(inv.customer?.id).toBe(created.customerId);
    expect(inv.items?.length).toBe(1);
    expect(inv.items[0].productId).toBe(created.productId);
    expect(Number(inv.total)).toBe(100);
    expect(Number(inv.paidAmount)).toBe(60);
    expect(Number(inv.remainingAmount)).toBe(40);
    expect(inv.status).toBe("PARTIAL");
  });

  await test.step("debt was auto-created and linked to the invoice", async () => {
    const r = await request.get(`/api/debts?customerId=${created.customerId}`);
    expect(r.status()).toBe(200);
    const { debts } = await r.json();
    const linked = debts.find(
      (d: { invoice?: { id: string } }) => d.invoice?.id === created.invoiceId
    );
    expect(linked, "no debt found pointing back to the new invoice").toBeTruthy();
    expect(Number(linked.amount)).toBe(40);
    created.debtId = linked.id;
  });

  await test.step("stock decremented from 10 → 9", async () => {
    const r = await request.get("/api/products?all=true");
    const found = (await r.json()).find((p: { id: string }) => p.id === created.productId);
    expect(found.stockQty).toBe(9);
  });

  await test.step("pay 20 on the debt → invoice paidAmount syncs to 80", async () => {
    const r = await request.post(`/api/debts/${created.debtId}/payment`, {
      data: { amount: 20 },
    });
    expect(r.status(), await r.text()).toBe(200);
    const updatedDebt = await r.json();
    expect(updatedDebt.status).toBe("PARTIAL");
    expect(updatedDebt.payments.length).toBe(1);

    const inv = await request.get(`/api/invoices/${created.invoiceId}`);
    const invBody = await inv.json();
    expect(Number(invBody.paidAmount)).toBe(80);
    expect(Number(invBody.remainingAmount)).toBe(20);
    expect(invBody.status).toBe("PARTIAL");
  });

  await test.step("create ticket for the same customer", async () => {
    const r = await request.post("/api/tickets", {
      data: {
        customerId: created.customerId,
        deviceType: "MOBILE",
        problemDescription: `${tag} repair test`,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    created.ticketId = (await r.json()).id;
  });

  await test.step("add a ticket part using the product → stock decrements again", async () => {
    const r = await request.post(`/api/tickets/${created.ticketId}/parts`, {
      data: {
        productId: created.productId,
        name: `${tag}-product`,
        qty: 1,
        unitCost: 50,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const part = await r.json();
    expect(part.productId).toBe(created.productId);
    expect(part.product?.id).toBe(created.productId);

    const prods = await (await request.get("/api/products?all=true")).json();
    expect(prods.find((p: { id: string }) => p.id === created.productId).stockQty).toBe(8);
  });

  await test.step("issue a repair invoice for the ticket", async () => {
    const r = await request.post("/api/invoices", {
      data: {
        customerId: created.customerId,
        ticketId: created.ticketId,
        items: [
          { productId: created.productId, name: `${tag}-product`, qty: 1, unitPrice: 100, source: "TICKET_PART" },
          { name: `${tag}-labor`, qty: 1, unitPrice: 80, source: "TICKET_LABOR" },
        ],
        status: "ISSUED",
        paidAmount: 180,
      },
    });
    expect(r.status(), await r.text()).toBe(201);
    const inv = await r.json();
    created.repairInvoiceId = inv.id;
    expect(inv.ticketId).toBe(created.ticketId);
    expect(inv.status).toBe("PAID");
    expect(inv.items.find((i: { source: string }) => i.source === "TICKET_PART")?.productId).toBe(
      created.productId
    );
    expect(inv.items.find((i: { source: string }) => i.source === "TICKET_LABOR")?.productId).toBeNull();
  });

  await test.step("ticket round-trips with its invoice and parts populated", async () => {
    const r = await request.get(`/api/tickets/${created.ticketId}`);
    expect(r.status()).toBe(200);
    const t = await r.json();
    expect(t.customer?.id).toBe(created.customerId);
    expect(t.invoice?.id).toBe(created.repairInvoiceId);
    expect(t.parts?.length).toBe(1);
    expect(t.parts[0].productId).toBe(created.productId);
  });

  await test.step("UI: invoice detail page renders", async () => {
    const res = await page.goto(`/invoices/${created.repairInvoiceId}`);
    expect(res?.status(), "invoice detail page should load").toBeLessThan(400);
    await expect(page.getByText(`${tag}-customer`).first()).toBeVisible();
  });

  await test.step("UI: ticket detail page renders with linked invoice", async () => {
    const res = await page.goto(`/maintenance/${created.ticketId}`);
    expect(res?.status(), "ticket detail page should load").toBeLessThan(400);
    await expect(page.getByText(`${tag}-customer`).first()).toBeVisible();
  });

  await test.step("UI: customer detail page renders", async () => {
    const res = await page.goto(`/customers/${created.customerId}`);
    expect(res?.status(), "customer detail page should load").toBeLessThan(400);
    await expect(page.getByText(`${tag}-customer`).first()).toBeVisible();
  });

  console.log("SMOKE created IDs:", created);
});
