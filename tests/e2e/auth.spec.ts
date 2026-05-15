import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads with MTC branding", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("img", { name: "MTC Electronics" })).toBeVisible();
    await expect(page.getByText("نظام إدارة الأعمال")).toBeVisible();
  });

  test("login form shows validation on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByText("يرجى إدخال البريد الإلكتروني وكلمة المرور")).toBeVisible();
  });

  test("login shows error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("example@email.com").fill("wrong@email.com");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة")).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("register page loads correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "إنشاء حساب جديد" })).toBeVisible();
    await expect(page.getByPlaceholder("محمد أحمد")).toBeVisible();
  });

  test("register validates password length", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("محمد أحمد").fill("مستخدم اختبار");
    await page.getByPlaceholder("example@email.com").fill("test@example.com");
    await page.locator("#password").fill("123");
    await page.locator("#confirmPassword").fill("123");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByText("كلمة المرور يجب أن تكون 6 أحرف على الأقل")).toBeVisible();
  });

  test("register validates password match", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("محمد أحمد").fill("مستخدم اختبار");
    await page.getByPlaceholder("example@email.com").fill("test@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("different123");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByText("كلمتا المرور غير متطابقتين")).toBeVisible();
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "إنشاء حساب جديد" }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("register page has link to login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
