-- Backfill: soft-delete debts whose linked invoice was cancelled before
-- the cancel-cascade was added. New cancellations handle this in-transaction
-- via app/api/invoices/[id]/route.ts; this one-shot cleans the orphans.
UPDATE "Debt"
SET "isDeleted" = true
WHERE "isDeleted" = false
  AND "invoiceId" IN (SELECT "id" FROM "Invoice" WHERE "status" = 'CANCELLED');
