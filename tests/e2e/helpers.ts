import type { APIRequestContext } from "@playwright/test";

// Shared session captured by global-setup.
export const AUTH_FILE = "tests/e2e/.auth/user.json";

let seq = 0;
/** Unique, recognisable label for test rows so they're easy to spot/purge. */
export const tag = (prefix = "E2E"): string => `${prefix}-${Date.now()}-${seq++}`;

/** Random 10-digit phone — phone is unique per shop, so randomise to avoid clashes. */
export const uniquePhone = (): string =>
  `7${Math.floor(Math.random() * 1e9).toString().padStart(9, "0")}`;

// ── cleanup helpers (best-effort; most are soft-deletes) ──────────────────────
const quiet = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch {
    /* cleanup is best-effort */
  }
};

export const cleanupCustomer = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/customers/${id}`));
export const cleanupSupplier = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/suppliers/${id}`));
export const cleanupProduct = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/products/${id}`));
export const cleanupTicket = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/tickets/${id}`));
export const cleanupCategory = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/categories/${id}`));
export const cleanupExpense = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/expenses`, { data: { id } }));
export const cleanupInvoice = (r: APIRequestContext, id: string) =>
  quiet(() => r.delete(`/api/invoices/${id}`));

/** Cancel an issued invoice (restores stock, voids linked debts). */
export const cancelInvoice = (r: APIRequestContext, id: string) =>
  quiet(() => r.patch(`/api/invoices/${id}`, { data: { status: "CANCELLED" } }));

/** Hard-delete any entity via the assistant's delete action (used for rows the
 * REST DELETE endpoints refuse, e.g. debts or delivered tickets). */
export const hardDelete = (
  r: APIRequestContext,
  entity: "customer" | "supplier" | "product" | "invoice" | "expense" | "debt" | "ticket",
  id: string
) =>
  quiet(() =>
    r.post(`/api/chat/action`, {
      data: { action: { kind: "delete_record", summary: "cleanup", payload: { entity, id } } },
    })
  );

/** Only manual debts have a REST DELETE; invoice-linked ones don't. Purge via
 * the assistant's hard-delete action so cleanup works for both. */
export const cleanupDebt = (r: APIRequestContext, id: string) => hardDelete(r, "debt", id);
