-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VendorCategory" ADD VALUE 'HOME_KITCHEN';
ALTER TYPE "VendorCategory" ADD VALUE 'BEAUTY';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "featuredUntil" TIMESTAMP(3),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subcategory" TEXT;

-- CreateIndex
CREATE INDEX "vendors_isFeatured_idx" ON "vendors"("isFeatured");

-- CreateIndex
CREATE INDEX "vendors_displayOrder_idx" ON "vendors"("displayOrder");
