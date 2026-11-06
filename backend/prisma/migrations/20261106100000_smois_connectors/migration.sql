-- AlterTable
ALTER TABLE "smois_conversations" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "smois_integrations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "externalName" TEXT,
    "scopes" TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "rateLimitedUntil" TIMESTAMP(3),
    "expiryNotifiedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_sync_jobs" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'SCHEDULE',
    "requestedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "nextRetryAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "smois_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "smois_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smois_integrations_accountId_key" ON "smois_integrations"("accountId");

-- CreateIndex
CREATE INDEX "smois_integrations_status_nextSyncAt_idx" ON "smois_integrations"("status", "nextSyncAt");

-- CreateIndex
CREATE INDEX "smois_sync_jobs_integrationId_startedAt_idx" ON "smois_sync_jobs"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "smois_sync_jobs_status_nextRetryAt_idx" ON "smois_sync_jobs"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_webhook_events_provider_eventKey_key" ON "smois_webhook_events"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "smois_conversations_accountId_externalId_key" ON "smois_conversations"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "smois_integrations" ADD CONSTRAINT "smois_integrations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_sync_jobs" ADD CONSTRAINT "smois_sync_jobs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "smois_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

