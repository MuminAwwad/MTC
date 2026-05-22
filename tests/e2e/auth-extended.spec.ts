import { test, expect } from "@playwright/test";

test.describe("Login page UI", () => {
  test("renders branding, form fields, and supporting text", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("img", { name: "MTC Electronics" })).toBeVisible();
    await expect(page.getByText("نظام إدارة الأعمال")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
    await expect(page.getByText("نابلس، فلسطين | 0599880618")).toBeVisible();
  });

  test("has working forgot-password link", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole("heading", { name: "نسيت كلمة المرور؟" })).toBeVisible();
  });

  test("password toggle reveals plaintext on click", async ({ page }) => {
    await page.goto("/login");
    const pwd = page.locator("#password");
    await pwd.fill("secret123");
    await expect(pwd).toHaveAttribute("type", "password");
    // The eye button is the only button inside the password container (not the submit button)
    await page.locator("#password").locator("..").locator("button").click();
    await expect(pwd).toHaveAttribute("type", "text");
  });

  test("validates email format via browser (type=email)", async ({ page }) => {
    await page.goto("/login");
    const email = page.locator("#email");
    await expect(email).toHaveAttribute("type", "email");
  });

  test("login button shows loading state when submitted", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("loadtest@example.com");
    await page.locator("#password").fill("anypassword");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    // Either we see the loading spinner text or the error toast — both are acceptable as "submitted"
    await expect(
      page.getByText(/جاري تسجيل الدخول|البريد الإلكتروني أو كلمة المرور غير صحيحة/)
    ).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Register page UI", () => {
  test("renders all registration fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "إنشاء حساب جديد" })).toBeVisible();
    await expect(page.getByPlaceholder("محمد أحمد")).toBeVisible();
    await expect(page.getByPlaceholder("example@email.com")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
  });

  test("requires name", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("example@email.com").fill("test@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("password123");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByText("الاسم مطلوب")).toBeVisible();
  });

  test("requires email", async ({ page }) => {
    await page.goto("/register");
    await page.getByPlaceholder("محمد أحمد").fill("اختبار");
    await page.locator("#password").fill("password123");
    await page.locator("#confirmPassword").fill("password123");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByText("البريد الإلكتروني مطلوب")).toBeVisible();
  });
});

test.describe("Forgot-password page", () => {
  test("loads with logo and form", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("img", { name: "MTC Electronics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "نسيت كلمة المرور؟" })).toBeVisible();
    await expect(page.getByPlaceholder("example@email.com")).toBeVisible();
  });

  test("rejects empty email", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByRole("button", { name: "إرسال رابط إعادة التعيين" }).click();
    await expect(page.getByText("يرجى إدخال البريد الإلكتروني")).toBeVisible();
  });

  test("has link back to login", async ({ page }) => {
    await page.goto("/forgot-password");
    // any anchor pointing to /login
    const loginLinks = page.locator('a[href="/login"]');
    await expect(loginLinks.first()).toBeVisible();
  });
});
