import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupProduct, cancelInvoice } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("Installment sales", () => {
  test("split remaining into N debts, allocate invoice payment earliest-due first", async ({ request, page }) => {
    test.setTimeout(120_000);
    const label = tag("INST");
    let customerId = "";
    let productId = "";
    let invoiceId = "";

    try {
      // customer + product (stock 5)
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      expect(c.status(), await c.text()).toBe(201);
      customerId = (await c.json()).id;

      const p = await request.post("/api/products", {
        data: { name: `${label}-prod`, costPrice: 40, sellPrice: 100, stockQty: 5 },
      });
      expect(p.status(), await p.text()).toBe(201);
      productId = (await p.json()).id;

      // Installment invoice: 3 × 100 = 300, no deposit, 3 monthly installments.
      const dueDates = ["2026-06-01", "2026-07-01", "2026-08-01"];
      const inv = await request.post("/api/invoices", {
        data: {
          customerId,
          items: [{ productId, name: `${label}-prod`, qty: 3, unitPrice: 100 }],
          status: "ISSUED",
          paidAmount: 0,
          debt: { notes: "خطة أقساط" },
          installments: { dueDates },
        },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      const invBody = await inv.json();
      invoiceId = invBody.id;
      expect(Number(invBody.total)).toBe(300);
      expect(Number(invBody.remainingAmount)).toBe(300);

      // Three linked debts, 100 each, due dates and labels correct.
      let detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(detail.debts.length).toBe(3);
      const byDue = [...detail.debts].sort(
        (a: { dueDate: string }, b: { dueDate: string }) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      expect(byDue.map((d: { amount: number }) => Number(d.amount))).toEqual([100, 100, 100]);
      byDue.forEach((d: { dueDate: string; reason: string }, i: number) => {
        expect(d.dueDate.slice(0, 10)).toBe(dueDates[i]);
        expect(d.reason).toContain(`قسط ${i + 1}/3`);
      });

      // Record a ₪150 payment at the invoice level → earliest-due installment
      // fully paid, the next partially, the third untouched.
      const pay = await request.post(`/api/invoices/${invoiceId}/payment`, { data: { amount: 150 } });
      expect(pay.status(), await pay.text()).toBe(200);

      detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(Number(detail.paidAmount)).toBe(150);
      expect(Number(detail.remainingAmount)).toBe(150);
      expect(detail.status).toBe("PARTIAL");

      const sorted = [...detail.debts].sort(
        (a: { dueDate: string }, b: { dueDate: string }) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
      const paidOf = (d: { payments: { amount: number }[] }) => d.payments.reduce((s, x) => s + Number(x.amount), 0);
      expect(sorted[0].status).toBe("PAID");
      expect(paidOf(sorted[0])).toBe(100);
      expect(sorted[1].status).toBe("PARTIAL");
      expect(paidOf(sorted[1])).toBe(50);
      expect(sorted[2].status).toBe("PENDING");
      expect(paidOf(sorted[2])).toBe(0);

      // UI: invoice detail renders the installments breakdown.
      const res = await page.goto(`/invoices/${invoiceId}`);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.getByText("الأقساط").first()).toBeVisible();
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (productId) await cleanupProduct(request, productId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("editing an installment invoice redistributes across all installments", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INSTE");
    let customerId = "";
    let invoiceId = "";
    try {
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      customerId = (await c.json()).id;

      // 3 × 100 = 300 over 3 installments → three debts of 100
      const inv = await request.post("/api/invoices", {
        data: {
          customerId,
          items: [{ name: `${label}-line`, qty: 3, unitPrice: 100 }],
          status: "ISSUED",
          paidAmount: 0,
          installments: { dueDates: ["2026-06-01", "2026-07-01", "2026-08-01"] },
        },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      invoiceId = (await inv.json()).id;

      // Edit the price up: 3 × 120 = 360 → installments must re-spread to 120 each,
      // NOT dump 360 onto the first debt (the bug this guards against).
      const put = await request.put(`/api/invoices/${invoiceId}`, {
        data: { items: [{ name: `${label}-line`, qty: 3, unitPrice: 120 }] },
      });
      expect(put.status(), await put.text()).toBe(200);

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(Number(detail.total)).toBe(360);
      expect(Number(detail.remainingAmount)).toBe(360);
      expect(detail.debts.length).toBe(3);
      const amounts = detail.debts.map((d: { amount: number }) => Number(d.amount)).sort((a: number, b: number) => a - b);
      expect(amounts).toEqual([120, 120, 120]);
      const sum = amounts.reduce((s: number, x: number) => s + x, 0);
      expect(sum).toBe(360);
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("uneven split rounds correctly and sums to the remaining", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("INSTR");
    let customerId = "";
    let invoiceId = "";
    try {
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      customerId = (await c.json()).id;

      // total 100, no deposit, 3 installments → 33.33 / 33.33 / 33.34
      const inv = await request.post("/api/invoices", {
        data: {
          customerId,
          items: [{ name: `${label}-line`, qty: 1, unitPrice: 100 }],
          status: "ISSUED",
          paidAmount: 0,
          installments: { dueDates: ["2026-06-01", "2026-07-01", "2026-08-01"] },
        },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      invoiceId = (await inv.json()).id;

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      const amounts = [...detail.debts]
        .sort((a: { dueDate: string }, b: { dueDate: string }) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .map((d: { amount: number }) => Number(d.amount));
      expect(amounts).toEqual([33.33, 33.33, 33.34]);
      expect(amounts.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 2);
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });
});
