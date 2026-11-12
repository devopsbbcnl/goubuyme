-- CreateEnum
CREATE TYPE "ProspectSchedule" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "ProspectRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'ADDED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'PROSPECTING';

-- CreateTable
CREATE TABLE "prospect_searches" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" "VendorCategory",
    "city" TEXT,
    "area" TEXT,
    "minRating" DOUBLE PRECISION,
    "minReviews" INTEGER,
    "maxResults" INTEGER NOT NULL DEFAULT 20,
    "schedule" "ProspectSchedule" NOT NULL DEFAULT 'NONE',
    "autoAddMinScore" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_runs" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "status" "ProspectRunStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "placesCalls" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "alreadyKnown" INTEGER NOT NULL DEFAULT 0,
    "withUs" INTEGER NOT NULL DEFAULT 0,
    "belowBar" INTEGER NOT NULL DEFAULT 0,
    "sitesRead" INTEGER NOT NULL DEFAULT 0,
    "autoAdded" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "searchId" TEXT,
    "name" TEXT NOT NULL,
    "category" "VendorCategory",
    "address" TEXT,
    "city" TEXT,
    "area" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "phoneKey" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "mapsUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "businessStatus" TEXT,
    "signals" JSONB,
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "fitReasons" JSONB,
    "existingVendorId" TEXT,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "leadId" TEXT,
    "drafts" JSONB,
    "enrichedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospect_searches_schedule_nextRunAt_idx" ON "prospect_searches"("schedule", "nextRunAt");

-- CreateIndex
CREATE INDEX "prospect_runs_searchId_createdAt_idx" ON "prospect_runs"("searchId", "createdAt");

-- CreateIndex
CREATE INDEX "prospect_runs_createdAt_idx" ON "prospect_runs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_placeId_key" ON "prospects"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "prospects_leadId_key" ON "prospects"("leadId");

-- CreateIndex
CREATE INDEX "prospects_status_fitScore_idx" ON "prospects"("status", "fitScore");

-- CreateIndex
CREATE INDEX "prospects_searchId_status_idx" ON "prospects"("searchId", "status");

-- CreateIndex
CREATE INDEX "prospects_phoneKey_idx" ON "prospects"("phoneKey");

-- AddForeignKey
ALTER TABLE "prospect_runs" ADD CONSTRAINT "prospect_runs_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "prospect_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "prospect_searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

