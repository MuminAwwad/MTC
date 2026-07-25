import { cache } from "react";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { createClient } from "./supabase/server";

export interface AuthContext {
  authEmail: string;
  /**
   * The shop's data-scope id: shopOwnerId for an employee, or the user's own
   * id for a shop owner / independent account. Every ownerId-scoped query or
   * write must use this, not dbUser.id, so an owner and their employees share
   * one data set. Use dbUser.id (not this) when attributing an action to the
   * specific person who performed it (createdById, stock movement actor…).
   */
  ownerId: string;
  dbUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
}

type DbUserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  isDeleted: boolean;
  shopOwnerId: string | null;
};

/**
 * Per-instance cache of the DB user row keyed by lowercased email. The row is
 * read on every API request but changes rarely (name/role/isActive edits), so
 * a short TTL removes a DB round trip from nearly every request. Deactivating
 * a user or changing a role takes effect within TTL_MS at worst.
 */
const userRowCache = new Map<string, { row: DbUserRow; expires: number }>();
const TTL_MS = 30_000;

/** Drop the cached row after a mutation to /api/users so changes apply immediately. */
export function invalidateUserCache(email?: string) {
  if (email) userRowCache.delete(email.toLowerCase());
  else userRowCache.clear();
}

async function loadDbUser(
  email: string,
  authUser: { id: string; user_metadata?: Record<string, unknown> | null }
): Promise<DbUserRow> {
  const cached = userRowCache.get(email);
  if (cached && cached.expires > Date.now()) return cached.row;

  let dbUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true, isActive: true, isDeleted: true, shopOwnerId: true },
  });

  if (!dbUser) {
    const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : email.split("@")[0];
    const phone = typeof meta.phone === "string" ? meta.phone : null;
    const address = typeof meta.address === "string" ? meta.address : null;
    dbUser = await prisma.user.create({
      data: { id: authUser.id, name, email, phone, address, role: "STAFF" },
      select: { id: true, name: true, email: true, role: true, isActive: true, isDeleted: true, shopOwnerId: true },
    });
  }

  userRowCache.set(email, { row: dbUser, expires: Date.now() + TTL_MS });
  return dbUser;
}

/**
 * Loads the authenticated user from the Supabase session and ensures a
 * matching active User row exists in the DB. Returns an AuthContext on
 * success, or a NextResponse (401/403) the caller should return as-is.
 *
 * If the auth session is valid but no DB row exists yet (first login after
 * signup), this provisions one from the Supabase user_metadata.
 *
 * Reads the session from cookies (getSession) instead of re-validating with
 * a network call (getUser): proxy.ts already runs getUser() against Supabase
 * on every matched request — including all of /api — and rejects invalid
 * sessions with a 401 before a handler runs, so re-validating here only
 * added a second auth round trip per request.
 *
 * Wrapped in React cache() so several server components in one render (e.g.
 * the dashboard cards) share a single lookup instead of each paying for it.
 */
export const requireUser = cache(async (): Promise<AuthContext | NextResponse> => {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user?.email) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const email = user.email.toLowerCase();
  const dbUser = await loadDbUser(email, user);

  if (dbUser.isDeleted || !dbUser.isActive) {
    return NextResponse.json({ error: "الحساب معطل" }, { status: 403 });
  }

  return { authEmail: email, ownerId: dbUser.shopOwnerId ?? dbUser.id, dbUser };
});

export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.dbUser.role !== "ADMIN") {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  return ctx;
}
