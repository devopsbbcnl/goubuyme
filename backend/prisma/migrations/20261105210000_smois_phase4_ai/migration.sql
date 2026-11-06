-- AlterTable
ALTER TABLE "smois_settings" ADD COLUMN     "aiDailyLimit" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "smois_targets" ADD COLUMN     "lastNotifiedStatus" TEXT;

-- CreateTable
CREATE TABLE "smois_ai_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "unverifiedCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smois_ai_requests_userId_createdAt_idx" ON "smois_ai_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_ai_requests_feature_createdAt_idx" ON "smois_ai_requests"("feature", "createdAt");

