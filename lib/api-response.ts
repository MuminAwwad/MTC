import { NextResponse } from "next/server";

function isDecimal(v: unknown): v is { toNumber(): number } {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.toNumber === "function" &&
    typeof (obj as { toFixed?: unknown }).toFixed === "function" &&
    "s" in obj &&
    "e" in obj &&
    "d" in obj
  );
}

/**
 * Walks any data shape and converts Prisma Decimal instances to plain
 * numbers. Leaves Date, null, arrays, and primitives untouched.
 * Use via `ok(data)` so consumers can call `.toFixed()` directly on
 * decimal fields without a Number() wrapper.
 */
function convertDecimals<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(convertDecimals) as unknown as T;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (isDecimal(value)) return value.toNumber() as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convertDecimals(v);
    }
    return out as T;
  }
  return value;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(convertDecimals(data), init);
}
