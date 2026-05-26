-- AlterTable
ALTER TABLE "delivery_zones" ADD COLUMN     "landmarkKeywords" TEXT[],
ADD COLUMN     "parentZoneId" TEXT,
ADD COLUMN     "requiresManualCorrection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zoneType" TEXT NOT NULL DEFAULT 'CITY';

-- CreateIndex
CREATE INDEX "delivery_zones_zoneType_idx" ON "delivery_zones"("zoneType");

-- CreateIndex
CREATE INDEX "delivery_zones_parentZoneId_idx" ON "delivery_zones"("parentZoneId");
