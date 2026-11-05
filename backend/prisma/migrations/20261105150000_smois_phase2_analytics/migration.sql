-- CreateEnum
CREATE TYPE "SmoisReportType" AS ENUM ('WEEKLY_MANAGER', 'MONTHLY_DEPARTMENT', 'QUARTERLY_DEPARTMENT', 'ANNUAL_DEPARTMENT');

-- CreateEnum
CREATE TYPE "SmoisReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CLARIFICATION_REQUESTED', 'APPROVED');

-- CreateTable
CREATE TABLE "smois_metric_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "followers" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "engagement" INTEGER,
    "profileVisits" INTEGER,
    "videoViews" INTEGER,
    "websiteClicks" INTEGER,
    "dataStatus" TEXT NOT NULL DEFAULT 'MANUAL',
    "source" TEXT NOT NULL DEFAULT 'Entered by hand',
    "metricVersion" TEXT NOT NULL DEFAULT 'v1',
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedById" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_post_metrics" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "clicks" INTEGER,
    "videoViews" INTEGER,
    "dataStatus" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "enteredById" TEXT NOT NULL,

    CONSTRAINT "smois_post_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_targets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "scope" TEXT NOT NULL,
    "platform" "SmoisPlatform",
    "accountId" TEXT,
    "memberId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "supervisorId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_evaluations" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "feedback" TEXT NOT NULL,
    "rating" INTEGER,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_reports" (
    "id" TEXT NOT NULL,
    "type" "SmoisReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "SmoisReportStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "commentary" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "dueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smois_metric_snapshots_snapshotDate_idx" ON "smois_metric_snapshots"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "smois_metric_snapshots_accountId_snapshotDate_key" ON "smois_metric_snapshots"("accountId", "snapshotDate");

-- CreateIndex
CREATE INDEX "smois_post_metrics_variantId_recordedAt_idx" ON "smois_post_metrics"("variantId", "recordedAt");

-- CreateIndex
CREATE INDEX "smois_targets_scope_isActive_idx" ON "smois_targets"("scope", "isActive");

-- CreateIndex
CREATE INDEX "smois_targets_memberId_idx" ON "smois_targets"("memberId");

-- CreateIndex
CREATE INDEX "smois_evaluations_memberId_createdAt_idx" ON "smois_evaluations"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_reports_type_status_idx" ON "smois_reports"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "smois_reports_authorId_type_periodStart_key" ON "smois_reports"("authorId", "type", "periodStart");

-- AddForeignKey
ALTER TABLE "smois_metric_snapshots" ADD CONSTRAINT "smois_metric_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_post_metrics" ADD CONSTRAINT "smois_post_metrics_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "smois_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

