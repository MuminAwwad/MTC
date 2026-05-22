import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function loadEnv(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export const E2E_AUTH_FILE = "tests/e2e/.auth/user.json";

export default async function globalSetup(config: FullConfig): Promise<void> {
  // .env.local overrides .env (matches Next.js precedence).
  loadEnv(".env");
  loadEnv(".env.local");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "Playwright globalSetup: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const email = process.env.E2E_USER_EMAIL ?? "e2e-test@mtc.local";
  const password = process.env.E2E_USER_PASSWORD ?? "E2eTestPass!2026";

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Idempotent: create-or-rotate password so the credentials always work even
  // if the user exists from a previous run with a different password.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "E2E Test User" },
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
  }

  // Drive the actual login flow so @supabase/ssr writes its cookies into a
  // browser context; reverse-engineering the cookie format is fragile.
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByPlaceholder("example@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });

  mkdirSync(dirname(E2E_AUTH_FILE), { recursive: true });
  await context.storageState({ path: E2E_AUTH_FILE });
  await browser.close();
}
