-- Per-invoice delivery fee. Added after tax (not taxed) so the cashier can
-- charge the customer a flat shipping/delivery amount on top of the items.
ALTER TABLE "Invoice"
  ADD COLUMN "deliveryFee" DECIMAL(10, 2) NOT NULL DEFAULT 0;
