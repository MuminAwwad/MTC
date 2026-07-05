// Client for the e-commerce storefront's Neon Postgres database.
//
// This is a *second* database, separate from this app's own Supabase/Prisma
// data. The storefront (MTC-E-Commerce repo) owns the schema and reads it
// live; this app connects to manage the admin-owned parts: product publish
// status, overrides, and the storefront CMS content.

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type StoreDb = NodePgDatabase<typeof schema>;

// Cache on globalThis so dev HMR and serverless invocations reuse one pool.
const globalForStoreDb = globalThis as unknown as {
  __storePool?: Pool;
  __storeDb?: StoreDb;
};

/** True when the store database connection string is configured. */
export const hasStoreDb = (): boolean => Boolean(process.env.STORE_DATABASE_URL);

/** Returns the Drizzle client for the store DB, or null when not configured. */
export function getStoreDb(): StoreDb | null {
  const raw = process.env.STORE_DATABASE_URL;
  if (!raw) return null;
  if (!globalForStoreDb.__storeDb) {
    // SSL is configured on the Pool directly; strip conflicting URL params
    // (same approach as lib/prisma.ts for the Supabase pooler).
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("channel_binding");
    const pool = new Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    globalForStoreDb.__storePool = pool;
    globalForStoreDb.__storeDb = drizzle(pool, { schema });
  }
  return globalForStoreDb.__storeDb;
}
