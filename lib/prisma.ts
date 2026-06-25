import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const raw =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/mtc_electronics";

  // Strip sslmode/pgbouncer query params — we configure SSL directly on the Pool
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("pgbouncer");
  const connectionString = url.toString();

  const isRemote = connectionString.includes("supabase.com") || connectionString.includes("supabase.co");
  const pool = new Pool({
    connectionString,
    ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
    // Supabase's pooler caps total client connections. Each serverless
    // instance is effectively single-threaded, so keep the per-instance
    // pool small and reap idle connections promptly so they don't pile up
    // and exhaust the cap (which surfaces as empty pages on failed queries).
    max: isRemote ? 1 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
