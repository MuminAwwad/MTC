-- Backfill: zero out remainingAmount on already-cancelled invoices.
-- New cancellations handle this in-transaction via the invoice PATCH;
-- this one-shot fixes existing rows that pre-date the change so the
-- customer/dashboard/invoices-summary views stop showing them as owed.
UPDATE "Invoice"
SET "remainingAmount" = 0
WHERE "status" = 'CANCELLED'
  AND "remainingAmount" <> 0;
