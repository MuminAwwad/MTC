import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env loader (no `dotenv` dep): supports `KEY=value` and `KEY="value with spaces"`.
function readEnvFile(file: string): Record<string, string> {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

// .env.local overrides .env (matches Next.js precedence).
const envForTests = { ...readEnvFile(".env"), ...readEnvFile(".env.local") };

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    // Run integration tests serially — Prisma pool + shared counters don't tolerate parallel writes.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    env: envForTests,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
