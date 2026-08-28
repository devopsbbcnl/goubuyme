-- CreateEnum
CREATE TYPE "ErrorCategory" AS ENUM ('USER_ERROR', 'SERVER_ERROR', 'ATTACK', 'SYSTEM_RISK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "error_logs" ADD COLUMN     "aiRecommendation" TEXT,
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "analyzedBy" TEXT,
ADD COLUMN     "category" "ErrorCategory",
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "severity" "ErrorSeverity";

-- CreateIndex
CREATE INDEX "error_logs_category_idx" ON "error_logs"("category");

-- CreateIndex
CREATE INDEX "error_logs_severity_idx" ON "error_logs"("severity");

-- CreateIndex
CREATE INDEX "error_logs_fingerprint_idx" ON "error_logs"("fingerprint");
