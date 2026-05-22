import { test, expect } from "@playwright/test";

test.describe("Public routes & redirects", () => {
  test("root / redirects to /dashboard (which bounces to /login when unauth)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("dashboard pages all redirect unauth to /login", async ({ page }) => {
    const protectedPaths = [
      "/dashboard",
      "/customers",
      "/suppliers",
      "/inventory",
      "/invoices",
      "/maintenance",
      "/debts",
      "/expenses",
      "/reports",
      "/profile",
      "/settings",
    ];
    for (const path of protectedPaths) {
      await page.goto(path);
      await expect(page, `expected ${path} to redirect to login`).toHaveURL(/\/login/);
    }
  });

  test("login is reachable directly", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.ok()).toBeTruthy();
  });

  test("register is reachable directly", async ({ page }) => {
    const res = await page.goto("/register");
    expect(res?.ok()).toBeTruthy();
  });

  test("forgot-password is reachable directly", async ({ page }) => {
    const res = await page.goto("/forgot-password");
    expect(res?.ok()).toBeTruthy();
  });

});

// proxy.ts redirects every unauthenticated non-API URL to /login, so the
// not-found page only renders when a session exists.
test.describe("404 page (authenticated)", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
  });

  test("404 page has link back to dashboard", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    const homeLink = page.getByRole("link", { name: "العودة للرئيسية" });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/dashboard");
  });
});

test.describe("Cross-page navigation", () => {
  test("can move login -> register -> login via links", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "إنشاء حساب جديد" }).click();
    await expect(page).toHaveURL(/\/register/);

    await page.getByRole("link", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
