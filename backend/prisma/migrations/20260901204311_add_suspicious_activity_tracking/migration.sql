-- AlterTable
ALTER TABLE "blocked_ips" ADD COLUMN     "isAuto" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "blockedBy" DROP NOT NULL;

-- CreateTable
CREATE TABLE "suspicious_activity" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastOccurrence" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "details" JSONB,

    CONSTRAINT "suspicious_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suspicious_activity_ip_idx" ON "suspicious_activity"("ip");

-- CreateIndex
CREATE INDEX "suspicious_activity_type_idx" ON "suspicious_activity"("type");

-- CreateIndex
CREATE UNIQUE INDEX "suspicious_activity_ip_type_key" ON "suspicious_activity"("ip", "type");

-- CreateIndex
CREATE INDEX "blocked_ips_isAuto_idx" ON "blocked_ips"("isAuto");
