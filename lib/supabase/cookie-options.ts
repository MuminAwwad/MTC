import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * "Remember me" support for Supabase auth sessions.
 *
 * Supabase issues a short-lived access token (JWT) and a long-lived refresh
 * token, both stored in cookies by @supabase/ssr. The cookie `maxAge` decides
 * how long those cookies survive in the browser:
 *  - remembered  -> persistent cookie (REMEMBERED_MAX_AGE), survives restarts
 *  - not remembered -> session cookie (no maxAge), cleared when the browser closes
 *
 * The preference is carried in a small readable flag cookie so all three cookie
 * write-sites (browser client, server client, proxy) agree on the same maxAge.
 */
export const REMEMBER_COOKIE = "mtc-remember";

/** 30 days, in seconds. */
export const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Cookie options passed to create{Browser,Server}Client so the auth cookies
 * inherit the right persistence. Omitting `maxAge` makes them session cookies.
 */
export function authCookieOptions(remember: boolean): CookieOptionsWithName {
  return remember ? { maxAge: REMEMBERED_MAX_AGE } : {};
}

/** Parse the remember flag out of a raw Cookie header / document.cookie string. */
export function readRememberFromString(
  cookieString: string | null | undefined
): boolean {
  if (!cookieString) return false;
  const match = cookieString
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REMEMBER_COOKIE}=`));
  return match?.split("=")[1] === "1";
}

/** Read the remember flag from document.cookie (browser only). */
export function readRememberFromDocument(): boolean {
  if (typeof document === "undefined") return false;
  return readRememberFromString(document.cookie);
}

/**
 * Persist the remember preference (call before signInWithPassword).
 * `1` is stored as a persistent cookie; `0` as a session cookie that clears on
 * browser close — so an un-remembered choice does not linger.
 */
export function writeRememberCookie(remember: boolean): void {
  if (typeof document === "undefined") return;
  const base = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; path=/; SameSite=Lax`;
  document.cookie = remember ? `${base}; max-age=${REMEMBERED_MAX_AGE}` : base;
}
