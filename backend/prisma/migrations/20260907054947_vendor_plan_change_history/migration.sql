-- CreateEnum
CREATE TYPE "PlanChangeInitiator" AS ENUM ('VENDOR', 'ADMIN');

-- CreateTable
CREATE TABLE "vendor_plan_changes" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fromTier" "CommissionTier" NOT NULL,
    "toTier" "CommissionTier" NOT NULL,
    "initiatedBy" "PlanChangeInitiator" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_plan_changes_vendorId_createdAt_idx" ON "vendor_plan_changes"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "vendor_plan_changes" ADD CONSTRAINT "vendor_plan_changes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_plan_changes" ADD CONSTRAINT "vendor_plan_changes_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
