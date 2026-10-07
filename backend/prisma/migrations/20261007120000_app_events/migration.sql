-- In-house product analytics: event stream + per-user analytics consent.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "analyticsOptIn" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "app_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "role" TEXT,
    "platform" TEXT NOT NULL,
    "sessionId" TEXT,
    "screen" TEXT,
    "properties" JSONB,
    "appVersion" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_events_name_occurredAt_idx" ON "app_events"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "app_events_userId_occurredAt_idx" ON "app_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "app_events_anonymousId_idx" ON "app_events"("anonymousId");

-- CreateIndex
CREATE INDEX "app_events_occurredAt_idx" ON "app_events"("occurredAt");
