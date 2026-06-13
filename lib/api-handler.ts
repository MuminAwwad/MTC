import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod/v4";
import { ok } from "./api-response";
import { requireUser, requireAdmin, type AuthContext } from "./auth";
import { InsufficientStockError } from "./stock";

/**
 * An error a route handler can throw to short-circuit with a specific status
 * and message. Lets handlers `throw new ApiError("...", 404)` instead of
 * threading early-return NextResponses through helpers — withAuth's catch
 * turns it into the right JSON response.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Next.js passes a route context whose `params` is a promise of the segments. */
type RouteContext<P> = { params: Promise<P> };

type AuthedHandler<P> = (
  req: NextRequest,
  ctx: AuthContext,
  route: RouteContext<P>
) => Promise<NextResponse> | NextResponse;

function toResponse(e: unknown): NextResponse {
  if (e instanceof InsufficientStockError) return ok({ error: e.message }, { status: 409 });
  if (e instanceof ApiError) return ok({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return ok({ error: first?.message ?? "بيانات غير صالحة" }, { status: 400 });
  }
  console.error(e);
  return ok({ error: "خطأ في الخادم" }, { status: 500 });
}

/**
 * Wrap a route handler with the auth guard + a single error funnel, removing
 * the `requireUser` + try/catch boilerplate that was repeated in every route.
 * The handler receives the resolved AuthContext as its second argument and the
 * Next.js route context (params) as its third.
 *
 *   export const GET = withAuth(async (req, ctx, { params }) => { ... });
 */
export function withAuth<P = Record<string, never>>(handler: AuthedHandler<P>) {
  return async (req: NextRequest, route: RouteContext<P>): Promise<NextResponse> => {
    const ctx = await requireUser();
    if (ctx instanceof NextResponse) return ctx;
    try {
      return await handler(req, ctx, route);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/** Same as withAuth but requires an ADMIN role (403 otherwise). */
export function withAdmin<P = Record<string, never>>(handler: AuthedHandler<P>) {
  return async (req: NextRequest, route: RouteContext<P>): Promise<NextResponse> => {
    const ctx = await requireAdmin();
    if (ctx instanceof NextResponse) return ctx;
    try {
      return await handler(req, ctx, route);
    } catch (e) {
      return toResponse(e);
    }
  };
}

/**
 * Parse a JSON request body against a zod schema, throwing ApiError(400) with
 * the first validation message on failure (caught by withAuth). Centralizes
 * the validate-or-400 dance so handlers get typed input in one line.
 */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("صيغة الطلب غير صالحة", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(result.error.issues[0]?.message ?? "بيانات غير صالحة", 400);
  }
  return result.data;
}
