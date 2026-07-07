-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "tier1CommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 3,
ADD COLUMN     "tier2CommissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 7.5;
