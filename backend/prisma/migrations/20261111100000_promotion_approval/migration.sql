-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "vendor_promotions"
  ADD COLUMN "approvalStatus" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- Cards that already exist were live under the old rules: keep them approved so the carousel doesn't change.
UPDATE "vendor_promotions" SET "approvalStatus" = 'APPROVED', "reviewedAt" = NOW();

-- CreateIndex
CREATE INDEX "vendor_promotions_approvalStatus_idx" ON "vendor_promotions"("approvalStatus");
