/*
  Warnings:

  - You are about to drop the column `branchId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupAddress` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupBranchName` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupLatitude` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `pickupLongitude` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `branches` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "branches" DROP CONSTRAINT "branches_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_branchId_fkey";

-- DropIndex
DROP INDEX "orders_branchId_idx";

-- DropIndex
DROP INDEX "vendors_userId_key";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "branchId",
DROP COLUMN "pickupAddress",
DROP COLUMN "pickupBranchName",
DROP COLUMN "pickupLatitude",
DROP COLUMN "pickupLongitude";

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "branchLabel" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "parentVendorId" TEXT;

-- DropTable
DROP TABLE "branches";

-- CreateIndex
CREATE INDEX "vendors_userId_idx" ON "vendors"("userId");

-- CreateIndex
CREATE INDEX "vendors_parentVendorId_idx" ON "vendors"("parentVendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_parentVendorId_fkey" FOREIGN KEY ("parentVendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
