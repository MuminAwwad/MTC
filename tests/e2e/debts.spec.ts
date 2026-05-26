import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupDebt, cancelInvoice } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("Debts — manual create, edit, payments", () => {
  test("manual debt lifecycle: create → edit → pay → settle", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("DEBT");
    let customerId = "";
    let debtId = "";
    try {
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      expect(c.status(), await c.text()).toBe(201);
      customerId = (await c.json()).id;

      // create
      const create = await request.post("/api/debts", {
        data: { customerId, amount: 200, currency: "ILS", reason: "قرض", dueDate: "2026-07-01" },
      });
      expect(create.status(), await create.text()).toBe(201);
      const debt = await create.json();
      debtId = debt.id;
      expect(Number(debt.amount)).toBe(200);
      expect(debt.status).toBe("PENDING");

      // edit amount + reason + dueDate
      const edit = await request.patch(`/api/debts/${debtId}`, {
        data: { amount: 250, reason: "قرض معدّل", dueDate: "2026-09-01" },
      });
      expect(edit.status(), await edit.text()).toBe(200);
      const edited = await edit.json();
      expect(Number(edited.amount)).toBe(250);
      expect(edited.reason).toBe("قرض معدّل");
      expect(edited.dueDate.slice(0, 10)).toBe("2026-09-01");
      expect(edited.status).toBe("PENDING");

      // partial payment → PARTIAL
      const pay1 = await request.post(`/api/debts/${debtId}/payment`, { data: { amount: 100 } });
      expect(pay1.status(), await pay1.text()).toBe(200);
      expect((await pay1.json()).status).toBe("PARTIAL");

      // editing amount below the amount already paid is rejected
      const bad = await request.patch(`/api/debts/${debtId}`, { data: { amount: 80 } });
      expect(bad.status()).toBe(400);

      // settle the rest → PAID
      const pay2 = await request.post(`/api/debts/${debtId}/payment`, { data: { amount: 150 } });
      expect(pay2.status(), await pay2.text()).toBe(200);
      expect((await pay2.json()).status).toBe("PAID");
    } finally {
      if (debtId) await cleanupDebt(request, debtId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("invoice-linked debt: amount/currency locked, dueDate/notes editable", async ({ request }) => {
    test.setTimeout(120_000);
    const label = tag("DEBTL");
    let customerId = "";
    let invoiceId = "";
    try {
      const c = await request.post("/api/customers", { data: { name: `${label}-cust`, phone: uniquePhone() } });
      customerId = (await c.json()).id;

      const inv = await request.post("/api/invoices", {
        data: {
          customerId,
          items: [{ name: `${label}-line`, qty: 1, unitPrice: 120 }],
          status: "ISSUED",
          paidAmount: 70, // remaining 50 → linked debt
        },
      });
      expect(inv.status(), await inv.text()).toBe(201);
      invoiceId = (await inv.json()).id;

      const detail = await (await request.get(`/api/invoices/${invoiceId}`)).json();
      expect(detail.debts.length).toBe(1);
      const linkedId = detail.debts[0].id;

      // amount change is rejected for an invoice-linked debt
      const badAmt = await request.patch(`/api/debts/${linkedId}`, { data: { amount: 999 } });
      expect(badAmt.status()).toBe(400);

      // dueDate / notes still editable
      const okEdit = await request.patch(`/api/debts/${linkedId}`, {
        data: { dueDate: "2026-10-15", notes: "تذكير" },
      });
      expect(okEdit.status(), await okEdit.text()).toBe(200);
      expect((await okEdit.json()).dueDate.slice(0, 10)).toBe("2026-10-15");
    } finally {
      if (invoiceId) await cancelInvoice(request, invoiceId);
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });
});
