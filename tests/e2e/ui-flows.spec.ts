import { test, expect } from "@playwright/test";
import { AUTH_FILE, tag, uniquePhone, cleanupCustomer, cleanupDebt } from "./helpers";

test.use({ storageState: AUTH_FILE });

test.describe("UI flows", () => {
  test("add a debt through the debts page modal", async ({ request, page }) => {
    test.setTimeout(120_000);
    const name = `${tag("UIDEBT")}-cust`;
    const customerId = (await (await request.post("/api/customers", { data: { name, phone: uniquePhone() } })).json()).id;
    let debtId = "";
    try {
      await page.goto("/debts");
      await page.getByRole("button", { name: "دين جديد" }).click();
      const dialog = page.locator("div.fixed.inset-0", {
        has: page.getByRole("heading", { name: "دين جديد" }),
      });
      await expect(dialog).toBeVisible();

      // CustomerSelector: type then pick the result
      const search = dialog.getByPlaceholder("ابحث عن عميل أو أضف جديد...");
      await search.click();
      await search.fill(name);
      // The dropdown shows the match as an exact <p>; the "create new" button
      // also echoes the query, so match exactly to hit the option.
      await dialog.getByText(name, { exact: true }).click();

      // amount (the only number field in the modal)
      await dialog.getByRole("spinbutton").fill("120");

      const [resp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/debts") && r.request().method() === "POST"
        ),
        dialog.getByRole("button", { name: "إضافة" }).click(),
      ]);
      expect(resp.status(), await resp.text()).toBe(201);

      // confirm it persisted via the API + capture id for cleanup
      const debts = (await (await request.get(`/api/debts?customerId=${customerId}`)).json()).debts;
      const d = debts.find((x: { amount: number }) => Number(x.amount) === 120);
      expect(d, "debt added via UI should exist").toBeTruthy();
      debtId = d.id;
    } finally {
      if (debtId) await cleanupDebt(request, debtId);
      await cleanupCustomer(request, customerId);
    }
  });

  test("new invoice page reveals the installments controls in debt mode", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/invoices/new");
    await expect(page.getByRole("heading", { name: "فاتورة جديدة" })).toBeVisible();

    // installments controls are hidden until the invoice is marked a debt
    await expect(page.getByText("تقسيم المتبقي إلى أقساط")).toBeHidden();

    await page.getByText("هذه الفاتورة دين على العميل").click();
    const split = page.getByText("تقسيم المتبقي إلى أقساط");
    await expect(split).toBeVisible();

    await split.click();
    await expect(page.getByText("عدد الأقساط")).toBeVisible();
    await expect(page.getByText("التكرار")).toBeVisible();
  });
});
