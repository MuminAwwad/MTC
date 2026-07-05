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
    // Supabase's pooler caps total client connections, so keep the
    // per-instance pool bounded — exhausting the cap surfaces as empty
    // pages on failed queries. But with Fluid compute one instance serves
    // many concurrent requests, and routes fan out with Promise.all, so a
    // single connection serializes every query in the instance. A small
    // pool (5) keeps parallelism without approaching the pooler's cap
    // (hundreds of client connections). Idle connections are kept for 30s
    // so back-to-back requests reuse them instead of paying a fresh
    // TLS + auth handshake each time.
    max: isRemote ? 5 : 10,
    idleTimeoutMillis: 30_000,
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
