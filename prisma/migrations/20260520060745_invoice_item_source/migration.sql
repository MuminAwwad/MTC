-- CreateEnum
CREATE TYPE "InvoiceItemSource" AS ENUM ('SALE', 'TICKET_PART', 'TICKET_LABOR');

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "source" "InvoiceItemSource" NOT NULL DEFAULT 'SALE';
