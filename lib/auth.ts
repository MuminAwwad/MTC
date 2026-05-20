import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { createClient } from "./supabase/server";

export interface AuthContext {
  authEmail: string;
  dbUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
}

/**
 * Loads the authenticated user from the Supabase session and ensures a
 * matching active User row exists in the DB. Returns an AuthContext on
 * success, or a NextResponse (401/403) the caller should return as-is.
 *
 * If the auth session is valid but no DB row exists yet (first login after
 * signup), this provisions one from the Supabase user_metadata.
 */
export async function requireUser(): Promise<AuthContext | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const email = user.email.toLowerCase();
  let dbUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true, isActive: true, isDeleted: true },
  });

  if (!dbUser) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const name = typeof meta.name === "string" && meta.name.trim() ? meta.name.trim() : email.split("@")[0];
    const phone = typeof meta.phone === "string" ? meta.phone : null;
    const address = typeof meta.address === "string" ? meta.address : null;
    dbUser = await prisma.user.create({
      data: { id: user.id, name, email, phone, address, role: "STAFF" },
      select: { id: true, name: true, email: true, role: true, isActive: true, isDeleted: true },
    });
  }

  if (dbUser.isDeleted || !dbUser.isActive) {
    return NextResponse.json({ error: "الحساب معطل" }, { status: 403 });
  }

  return { authEmail: email, dbUser };
}

export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.dbUser.role !== "ADMIN") {
    return NextResponse.json({ error: "صلاحيات غير كافية" }, { status: 403 });
  }
  return ctx;
}
