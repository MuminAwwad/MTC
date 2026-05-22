-- Per-user data isolation: every domain row now belongs to exactly one
-- User (the owner / shop). Pre-existing rows have no owner so we wipe the
-- domain tables before adding the NOT NULL ownerId column. The User table
-- is preserved.

-- 1. Wipe domain data (TRUNCATE CASCADE walks the FK graph)
TRUNCATE TABLE
  "DebtPayment", "Debt",
  "PayablePayment", "Payable",
  "InvoiceItem", "Invoice",
  "TicketUpdate", "TicketPart", "MaintenanceTicket",
  "StockMovement", "Product", "Category", "Supplier",
  "Expense", "ExpenseCategory",
  "Customer", "Counter"
CASCADE;

-- 2. Drop the old single-column unique indexes — they become composite below
DROP INDEX "Category_name_key";
DROP INDEX "Category_slug_key";
DROP INDEX "Customer_phone_key";
DROP INDEX "ExpenseCategory_name_key";
DROP INDEX "Invoice_invoiceNumber_key";
DROP INDEX "MaintenanceTicket_ticketNumber_key";
DROP INDEX "Product_barcode_key";
DROP INDEX "Product_sku_key";
DROP INDEX "Supplier_phone_key";

-- 3. Add ownerId NOT NULL on every owned table (safe now — tables are empty)
ALTER TABLE "Category" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Customer" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Debt" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Expense" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "ExpenseCategory" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "MaintenanceTicket" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Payable" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Product" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "StockMovement" ADD COLUMN "ownerId" TEXT NOT NULL;
ALTER TABLE "Supplier" ADD COLUMN "ownerId" TEXT NOT NULL;

-- 4. Indexes for ownerId lookups
CREATE INDEX "Category_ownerId_idx" ON "Category"("ownerId");
CREATE UNIQUE INDEX "Category_ownerId_name_key" ON "Category"("ownerId", "name");
CREATE UNIQUE INDEX "Category_ownerId_slug_key" ON "Category"("ownerId", "slug");
CREATE INDEX "Customer_ownerId_idx" ON "Customer"("ownerId");
CREATE UNIQUE INDEX "Customer_ownerId_phone_key" ON "Customer"("ownerId", "phone");
CREATE INDEX "Debt_ownerId_idx" ON "Debt"("ownerId");
CREATE INDEX "Expense_ownerId_idx" ON "Expense"("ownerId");
CREATE INDEX "ExpenseCategory_ownerId_idx" ON "ExpenseCategory"("ownerId");
CREATE UNIQUE INDEX "ExpenseCategory_ownerId_name_key" ON "ExpenseCategory"("ownerId", "name");
CREATE INDEX "Invoice_ownerId_idx" ON "Invoice"("ownerId");
CREATE UNIQUE INDEX "Invoice_ownerId_invoiceNumber_key" ON "Invoice"("ownerId", "invoiceNumber");
CREATE INDEX "MaintenanceTicket_ownerId_idx" ON "MaintenanceTicket"("ownerId");
CREATE UNIQUE INDEX "MaintenanceTicket_ownerId_ticketNumber_key" ON "MaintenanceTicket"("ownerId", "ticketNumber");
CREATE INDEX "Payable_ownerId_idx" ON "Payable"("ownerId");
CREATE INDEX "Product_ownerId_idx" ON "Product"("ownerId");
CREATE UNIQUE INDEX "Product_ownerId_sku_key" ON "Product"("ownerId", "sku");
CREATE UNIQUE INDEX "Product_ownerId_barcode_key" ON "Product"("ownerId", "barcode");
CREATE INDEX "StockMovement_ownerId_idx" ON "StockMovement"("ownerId");
CREATE INDEX "Supplier_ownerId_idx" ON "Supplier"("ownerId");
CREATE UNIQUE INDEX "Supplier_ownerId_phone_key" ON "Supplier"("ownerId", "phone");

-- 5. Foreign keys to User. ON DELETE CASCADE so dropping a user removes
--    their entire shop in one go (intentional — there's no shared data).
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
