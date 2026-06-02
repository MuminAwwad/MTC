import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone } from "./helpers";

test.use({ storageState: AUTH_FILE });

const SHOT = (name: string) => `verify-shots/${name}.png`;

test.describe("verify edit/delete additions", () => {
  test.setTimeout(120_000);

  test("invoice: draft shows Delete; non-draft does not; delete removes it", async ({
    page,
    request,
  }) => {
    // Setup: create a customer + DRAFT invoice through the API
    const cRes = await request.post("/api/customers", {
      data: { name: `${tag("VCUS")}-inv`, phone: uniquePhone() },
    });
    expect(cRes.status(), `customer create body: ${await cRes.text()}`).toBe(201);
    const customer = await cRes.json();

    const iRes = await request.post("/api/invoices", {
      data: {
        customerId: customer.id,
        items: [{ name: "بند تجريبي", qty: 1, unitPrice: 100 }],
      },
    });
    expect(iRes.status(), `invoice create body: ${await iRes.text()}`).toBe(201);
    const draft = await iRes.json();

    // 1. Detail page shows the Delete button for a DRAFT invoice.
    await page.goto(`/invoices/${draft.id}`);
    // Wait for the page header to render before asserting on buttons.
    await expect(page.getByRole("heading", { name: draft.invoiceNumber })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /^حذف$/ })).toBeVisible();
    await page.screenshot({ path: SHOT("01-invoice-draft-delete-visible"), fullPage: true });

    // 2. Issue the invoice and confirm the Delete button disappears.
    const issueRes = await request.patch(`/api/invoices/${draft.id}`, {
      data: { status: "ISSUED" },
    });
    if (!issueRes.ok()) {
      console.error("issue PATCH failed:", issueRes.status(), await issueRes.text());
    }
    expect(issueRes.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("button", { name: /^حذف$/ })).toHaveCount(0);
    await page.screenshot({ path: SHOT("02-invoice-issued-no-delete"), fullPage: true });

    // 3. Make a fresh DRAFT invoice and actually click the Delete button.
    const draft2 = await request
      .post("/api/invoices", {
        data: {
          customerId: customer.id,
          items: [{ name: "بند للحذف", qty: 1, unitPrice: 50 }],
        },
      })
      .then((r) => r.json());

    await page.goto(`/invoices/${draft2.id}`);
    await expect(page.getByRole("heading", { name: draft2.invoiceNumber })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /^حذف$/ }).click();
    // ConfirmDialog uses "تأكيد" as the confirm-button label.
    await expect(page.getByText("حذف الفاتورة")).toBeVisible();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await page.waitForURL(/\/invoices(\?.*)?$/, { timeout: 20_000 });
    await page.screenshot({ path: SHOT("03-invoice-after-delete"), fullPage: true });

    // Verify it's actually gone from the API.
    const after = await request.get(`/api/invoices/${draft2.id}`);
    expect([404, 200]).toContain(after.status());
    if (after.status() === 200) {
      const body = await after.json();
      expect(body.error ?? body.isDeleted).toBeTruthy();
    }

    // Cleanup: cancel the issued one, hard-delete the customer.
    await request.patch(`/api/invoices/${draft.id}`, { data: { status: "CANCELLED" } });
    await request.delete(`/api/customers/${customer.id}`);
  });

  test("ticket: edit page loads & saves; delete button visibility matches status", async ({
    page,
    request,
  }) => {
    // Setup: customer + RECEIVED ticket
    const customer = await request
      .post("/api/customers", {
        data: { name: `${tag("VCUS")}-tk`, phone: uniquePhone() },
      })
      .then((r) => r.json());

    const ticket = await request
      .post("/api/tickets", {
        data: {
          customerId: customer.id,
          deviceType: "MOBILE",
          deviceBrand: "OldBrand",
          deviceModel: "OldModel",
          problemDescription: "شاشة مكسورة",
          priority: "NORMAL",
        },
      })
      .then((r) => r.json());

    // 1. Detail page shows Edit + Delete (status is RECEIVED).
    await page.goto(`/maintenance/${ticket.id}`);
    await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible({
      timeout: 30_000,
    });
    const editLink = page.getByRole("link", { name: /تعديل/ });
    await expect(editLink).toBeVisible();
    await expect(page.getByRole("button", { name: /^حذف$/ })).toBeVisible();
    await page.screenshot({ path: SHOT("04-ticket-received-edit-delete"), fullPage: true });

    // 2. Click Edit → land on edit page → change fields → save.
    await editLink.click();
    await page.waitForURL(new RegExp(`/maintenance/${ticket.id}/edit`));
    // Edit page renders an "h1" with `تعديل {ticketNumber}` — wait on that.
    await expect(
      page.getByRole("heading", { name: new RegExp(`تعديل ${ticket.ticketNumber}`) })
    ).toBeVisible({ timeout: 30_000 });
    // Wait for the form to be hydrated with the loaded ticket — the brand
    // textbox is the most distinctive thing to anchor on.
    const brandInput = page.getByRole("textbox").filter({ hasText: "" }).first();
    // Better: find by sibling label text.
    const brandByLabel = page
      .locator("div")
      .filter({ has: page.locator("text=الماركة") })
      .locator("input")
      .first();
    await expect(brandByLabel).toHaveValue("OldBrand", { timeout: 15_000 });
    await brandByLabel.fill("NewBrand");
    await expect(brandByLabel).toHaveValue("NewBrand");

    // The priority is the second <select>; pick HIGH.
    await page.locator("select").nth(1).selectOption("HIGH");

    // Update problem description (first textarea).
    const problemTextarea = page.locator("textarea").first();
    await problemTextarea.fill("مشكلة محدّثة بعد التعديل");
    await expect(problemTextarea).toHaveValue("مشكلة محدّثة بعد التعديل");

    await page.getByRole("button", { name: /حفظ التعديلات/ }).click();
    await page.waitForURL(new RegExp(`/maintenance/${ticket.id}$`), { timeout: 30_000 });
    await page.screenshot({ path: SHOT("05-ticket-after-edit"), fullPage: true });

    // Verify the API now reflects the edits.
    const after = await request.get(`/api/tickets/${ticket.id}`).then((r) => r.json());
    expect(after.deviceBrand).toBe("NewBrand");
    expect(after.priority).toBe("HIGH");
    expect(after.problemDescription).toBe("مشكلة محدّثة بعد التعديل");

    // 3. Move ticket to DIAGNOSING and confirm Delete button disappears.
    const transRes = await request.patch(`/api/tickets/${ticket.id}`, {
      data: { status: "DIAGNOSING" },
    });
    expect(transRes.status(), `status transition body: ${await transRes.text()}`).toBe(200);
    await page.goto(`/maintenance/${ticket.id}`);
    await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible({
      timeout: 30_000,
    });
    // Edit is still visible (DIAGNOSING is not terminal), but Delete is not.
    await expect(page.getByRole("link", { name: /تعديل/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^حذف$/ })).toHaveCount(0);
    await page.screenshot({ path: SHOT("06-ticket-diagnosing-no-delete"), fullPage: true });

    // Cleanup: cancel + delete via API
    await request.patch(`/api/tickets/${ticket.id}`, { data: { status: "CANCELLED" } });
    await request.delete(`/api/tickets/${ticket.id}`);
    await request.delete(`/api/customers/${customer.id}`);
  });

  test("expense: pencil opens prefilled form; saving updates the row", async ({
    page,
    request,
  }) => {
    const desc = `${tag("VEXP")}-edit-me`;
    const created = await request
      .post("/api/expenses", {
        data: { amount: 11.11, description: desc, date: "2026-05-20" },
      })
      .then((r) => r.json());

    await page.goto("/expenses");
    await expect(page.getByRole("heading", { name: "المصاريف" })).toBeVisible({
      timeout: 30_000,
    });
    // Filter by search so our row is on screen.
    await page.getByPlaceholder(/بحث بالوصف/).fill(desc);
    // The desktop table renders the description inside <td>; the mobile <p>
    // (md:hidden) is hidden at desktop viewport. Scope to the visible one.
    const row = page.locator("tr", { hasText: desc }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: SHOT("07-expense-list-before-edit"), fullPage: true });

    // Click the pencil edit icon in that row.
    await row.getByRole("button", { name: "تعديل" }).click();

    // Form opens with "تعديل المصروف" heading and prefilled amount.
    await expect(page.getByText("تعديل المصروف")).toBeVisible();
    const amountInput = page.locator('input[type="number"]').first();
    await expect(amountInput).toHaveValue(/11\.?11/);
    await page.screenshot({ path: SHOT("08-expense-edit-form-prefilled"), fullPage: true });

    // Change amount and description.
    await amountInput.fill("22.22");
    const descInput = page.locator('input[placeholder*="وصف المصروف"]');
    await descInput.fill(`${desc}-UPDATED`);

    await page.getByRole("button", { name: /حفظ التعديلات/ }).click();
    // Form closes; updated row visible in the desktop table.
    const updatedRow = page.locator("tr", { hasText: `${desc}-UPDATED` }).first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: SHOT("09-expense-after-edit"), fullPage: true });

    // Verify via API.
    const after = await request
      .get(`/api/expenses?search=${encodeURIComponent(desc)}`)
      .then((r) => r.json());
    const found = (after.expenses ?? []).find((e: { id: string }) => e.id === created.id);
    expect(found).toBeTruthy();
    expect(Number(found.amount)).toBeCloseTo(22.22, 2);
    expect(found.description).toBe(`${desc}-UPDATED`);

    // Cleanup
    await request.delete(`/api/expenses/${created.id}`);
  });
});
