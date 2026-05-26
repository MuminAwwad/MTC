import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupDebt } from "./helpers";

test.use({ storageState: AUTH_FILE });

// The assistant stages an action then the user confirms it, which POSTs to
// /api/chat/action. These tests drive that commit endpoint directly (no LLM)
// to verify the write path + server-side re-validation.

test.describe("Assistant action commit (/api/chat/action)", () => {
  test("create_customer commits; duplicate phone rejected", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("ACT")}-cust`;
    const phone = uniquePhone();
    let customerId = "";
    try {
      const r = await request.post("/api/chat/action", {
        data: { action: { kind: "create_customer", summary: "إضافة عميل", payload: { name, phone } } },
      });
      expect(r.status(), await r.text()).toBe(200);
      expect((await r.json()).summary).toContain(name);

      const list = await (await request.get(`/api/customers?search=${encodeURIComponent(name)}`)).json();
      const found = (list.data ?? []).find((c: { name: string }) => c.name === name);
      expect(found, "customer created by the action should be findable").toBeTruthy();
      customerId = found.id;

      // re-validation: same phone must be rejected at commit time
      const dup = await request.post("/api/chat/action", {
        data: { action: { kind: "create_customer", summary: "x", payload: { name: `${name}-2`, phone } } },
      });
      expect(dup.status()).toBe(400);
    } finally {
      if (customerId) await cleanupCustomer(request, customerId);
    }
  });

  test("invalid actions are rejected", async ({ request }) => {
    const unknown = await request.post("/api/chat/action", {
      data: { action: { kind: "totally_not_a_tool", summary: "x", payload: {} } },
    });
    expect(unknown.status()).toBe(400);

    const noPayload = await request.post("/api/chat/action", {
      data: { action: { kind: "create_customer", summary: "x" } },
    });
    expect(noPayload.status()).toBe(400);
  });

  test("create_debt commits for a customer", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("ACTDEBT")}-cust`;
    const c = await request.post("/api/customers", { data: { name, phone: uniquePhone() } });
    const customerId = (await c.json()).id;
    let debtId = "";
    try {
      const r = await request.post("/api/chat/action", {
        data: { action: { kind: "create_debt", summary: "دين", payload: { customerId, amount: 75, reason: "اختبار" } } },
      });
      expect(r.status(), await r.text()).toBe(200);

      const debts = (await (await request.get(`/api/debts?customerId=${customerId}`)).json()).debts;
      const d = debts.find((x: { amount: number }) => Number(x.amount) === 75);
      expect(d, "debt created by the action should exist").toBeTruthy();
      debtId = d.id;
    } finally {
      if (debtId) await cleanupDebt(request, debtId);
      await cleanupCustomer(request, customerId);
    }
  });

  test("delete_record hard-deletes a customer", async ({ request }) => {
    test.setTimeout(60_000);
    const name = `${tag("ACTDEL")}-cust`;
    const c = await request.post("/api/customers", { data: { name, phone: uniquePhone() } });
    const id = (await c.json()).id;

    const del = await request.post("/api/chat/action", {
      data: { action: { kind: "delete_record", summary: "حذف", payload: { entity: "customer", id } } },
    });
    expect(del.status(), await del.text()).toBe(200);

    const list = await (await request.get(`/api/customers?search=${encodeURIComponent(name)}`)).json();
    const stillThere = (list.data ?? []).find((x: { id: string }) => x.id === id);
    expect(stillThere, "customer should be gone after hard delete").toBeFalsy();
  });
});
