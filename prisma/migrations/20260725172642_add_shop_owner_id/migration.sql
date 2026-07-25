-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shopOwnerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shopOwnerId_fkey" FOREIGN KEY ("shopOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
