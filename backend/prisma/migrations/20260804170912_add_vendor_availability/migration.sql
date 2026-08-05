-- CreateEnum
CREATE TYPE "VendorAvailabilityOverride" AS ENUM ('AUTO', 'FORCE_OPEN', 'FORCE_CLOSED');

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "availabilityOverride" "VendorAvailabilityOverride" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos';

-- CreateTable
CREATE TABLE "vendor_business_hours" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_temporary_closures" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_temporary_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_business_hours_vendorId_idx" ON "vendor_business_hours"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_business_hours_vendorId_dayOfWeek_idx" ON "vendor_business_hours"("vendorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "vendor_temporary_closures_vendorId_idx" ON "vendor_temporary_closures"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_temporary_closures_vendorId_startAt_idx" ON "vendor_temporary_closures"("vendorId", "startAt");

-- AddForeignKey
ALTER TABLE "vendor_business_hours" ADD CONSTRAINT "vendor_business_hours_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_temporary_closures" ADD CONSTRAINT "vendor_temporary_closures_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
