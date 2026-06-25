-- Add nullable purchase price (cost) to invoice line items for margin tracking.
ALTER TABLE "InvoiceItem" ADD COLUMN "costPrice" DECIMAL(10,2);
