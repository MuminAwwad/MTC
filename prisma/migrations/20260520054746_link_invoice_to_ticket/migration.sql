-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ticketId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_ticketId_key" ON "Invoice"("ticketId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
