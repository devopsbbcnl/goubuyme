-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "managerUserId" TEXT,
ADD COLUMN     "notifyOwnerOfOrders" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "vendors_managerUserId_key" ON "vendors"("managerUserId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

