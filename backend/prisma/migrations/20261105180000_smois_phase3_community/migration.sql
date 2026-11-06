-- CreateEnum
CREATE TYPE "SmoisConversationType" AS ENUM ('DIRECT_MESSAGE', 'COMMENT', 'MENTION', 'REPLY', 'STORY_INTERACTION', 'ENQUIRY', 'REVIEW');

-- CreateEnum
CREATE TYPE "SmoisConversationStatus" AS ENUM ('NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SmoisInboxPriority" AS ENUM ('HIGH', 'STANDARD', 'GENERAL');

-- CreateEnum
CREATE TYPE "SmoisCampaignStatus" AS ENUM ('PLANNING', 'BRIEFING', 'PREPARATION', 'APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SmoisSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN');

-- AlterTable
ALTER TABLE "smois_contents" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "smois_settings" ADD COLUMN     "businessDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "businessEndHour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "businessStartHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "slaGeneralMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "slaHighMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "slaStandardMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "smois_contacts" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT,
    "platform" "SmoisPlatform",
    "profileUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "assignedToId" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "consentNote" TEXT,
    "consentAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_conversations" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "SmoisConversationType" NOT NULL DEFAULT 'DIRECT_MESSAGE',
    "subject" TEXT,
    "externalUrl" TEXT,
    "status" "SmoisConversationStatus" NOT NULL DEFAULT 'NEW',
    "priority" "SmoisInboxPriority" NOT NULL DEFAULT 'GENERAL',
    "tags" TEXT[],
    "assignedMemberId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "slaDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "firstResponderId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalationType" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalationNote" TEXT,
    "slaBreachNotifiedAt" TIMESTAMP(3),
    "loggedById" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_saved_replies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_saved_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_campaigns" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "type" TEXT NOT NULL DEFAULT 'BRAND_AWARENESS',
    "ownerId" TEXT NOT NULL,
    "status" "SmoisCampaignStatus" NOT NULL DEFAULT 'PLANNING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "targetAudience" TEXT,
    "budget" DOUBLE PRECISION,
    "expectedResults" TEXT,
    "trackingLinks" JSONB NOT NULL DEFAULT '[]',
    "lessonsLearned" TEXT,
    "recommendations" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_campaign_accounts" (
    "campaignId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "smois_campaign_accounts_pkey" PRIMARY KEY ("campaignId","accountId")
);

-- CreateTable
CREATE TABLE "smois_campaign_members" (
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "smois_campaign_members_pkey" PRIMARY KEY ("campaignId","memberId")
);

-- CreateTable
CREATE TABLE "smois_campaign_results" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recordedFor" DATE NOT NULL,
    "reach" INTEGER,
    "impressions" INTEGER,
    "engagement" INTEGER,
    "clicks" INTEGER,
    "leads" INTEGER,
    "conversions" INTEGER,
    "spend" DOUBLE PRECISION,
    "revenue" DOUBLE PRECISION,
    "note" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_campaign_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "fileType" TEXT NOT NULL DEFAULT 'IMAGE',
    "fileSize" INTEGER,
    "url" TEXT NOT NULL,
    "folder" TEXT,
    "tags" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "usageRestrictions" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expiryNotifiedAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_keywords" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BRAND',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_mentions" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT,
    "platform" "SmoisPlatform",
    "authorName" TEXT,
    "url" TEXT,
    "text" TEXT NOT NULL,
    "sentiment" "SmoisSentiment" NOT NULL DEFAULT 'UNCERTAIN',
    "sentimentSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "reach" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "handledById" TEXT,
    "note" TEXT,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_competitors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "platform" "SmoisPlatform" NOT NULL,
    "handle" TEXT,
    "url" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "monitoringStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_competitor_snapshots" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "observedOn" DATE NOT NULL,
    "followers" INTEGER,
    "postsLast7Days" INTEGER,
    "avgEngagement" DOUBLE PRECISION,
    "popularContent" TEXT,
    "campaignNote" TEXT,
    "dataKind" TEXT NOT NULL DEFAULT 'PUBLIC_OBSERVATION',
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_competitor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smois_contacts_platform_username_idx" ON "smois_contacts"("platform", "username");

-- CreateIndex
CREATE INDEX "smois_contacts_anonymizedAt_idx" ON "smois_contacts"("anonymizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_conversations_number_key" ON "smois_conversations"("number");

-- CreateIndex
CREATE INDEX "smois_conversations_status_priority_idx" ON "smois_conversations"("status", "priority");

-- CreateIndex
CREATE INDEX "smois_conversations_assignedMemberId_status_idx" ON "smois_conversations"("assignedMemberId", "status");

-- CreateIndex
CREATE INDEX "smois_conversations_accountId_receivedAt_idx" ON "smois_conversations"("accountId", "receivedAt");

-- CreateIndex
CREATE INDEX "smois_conversations_slaDueAt_idx" ON "smois_conversations"("slaDueAt");

-- CreateIndex
CREATE INDEX "smois_messages_conversationId_occurredAt_idx" ON "smois_messages"("conversationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_campaigns_number_key" ON "smois_campaigns"("number");

-- CreateIndex
CREATE INDEX "smois_campaigns_status_startsAt_idx" ON "smois_campaigns"("status", "startsAt");

-- CreateIndex
CREATE INDEX "smois_campaign_results_campaignId_channel_idx" ON "smois_campaign_results"("campaignId", "channel");

-- CreateIndex
CREATE INDEX "smois_assets_category_archivedAt_idx" ON "smois_assets"("category", "archivedAt");

-- CreateIndex
CREATE INDEX "smois_assets_expiresAt_idx" ON "smois_assets"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_keywords_term_kind_key" ON "smois_keywords"("term", "kind");

-- CreateIndex
CREATE INDEX "smois_mentions_occurredAt_idx" ON "smois_mentions"("occurredAt");

-- CreateIndex
CREATE INDEX "smois_mentions_sentiment_occurredAt_idx" ON "smois_mentions"("sentiment", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_competitors_platform_handle_key" ON "smois_competitors"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "smois_competitor_snapshots_competitorId_observedOn_key" ON "smois_competitor_snapshots"("competitorId", "observedOn");

-- AddForeignKey
ALTER TABLE "smois_contents" ADD CONSTRAINT "smois_contents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "smois_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_conversations" ADD CONSTRAINT "smois_conversations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_conversations" ADD CONSTRAINT "smois_conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "smois_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_messages" ADD CONSTRAINT "smois_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "smois_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_campaign_accounts" ADD CONSTRAINT "smois_campaign_accounts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "smois_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_campaign_members" ADD CONSTRAINT "smois_campaign_members_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "smois_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_campaign_results" ADD CONSTRAINT "smois_campaign_results_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "smois_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_mentions" ADD CONSTRAINT "smois_mentions_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "smois_keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_competitor_snapshots" ADD CONSTRAINT "smois_competitor_snapshots_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "smois_competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

