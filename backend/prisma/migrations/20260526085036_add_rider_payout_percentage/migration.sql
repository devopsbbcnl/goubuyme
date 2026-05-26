-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "riderPayoutPercentage" DOUBLE PRECISION NOT NULL DEFAULT 85;

-- AlterTable
ALTER TABLE "pricing_profiles" ADD COLUMN     "riderPayoutPercentage" DOUBLE PRECISION NOT NULL DEFAULT 85;
