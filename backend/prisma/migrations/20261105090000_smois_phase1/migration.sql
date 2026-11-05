-- CreateEnum
CREATE TYPE "SmoisRole" AS ENUM ('MANAGEMENT', 'MANAGER', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SmoisPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER');

-- CreateEnum
CREATE TYPE "SmoisConnectionStatus" AS ENUM ('MANUAL', 'CONNECTED', 'EXPIRED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "SmoisAssignmentKind" AS ENUM ('PRIMARY', 'SECONDARY', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "SmoisContentStatus" AS ENUM ('IDEA', 'PLANNED', 'BRIEFED', 'IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmoisReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "SmoisTaskType" AS ENUM ('CONTENT_CREATION', 'GRAPHIC_DESIGN', 'VIDEO_PRODUCTION', 'PUBLISHING', 'COMMUNITY_MANAGEMENT', 'CAMPAIGN_EXECUTION', 'AUDIENCE_ENGAGEMENT', 'ANALYTICS_REVIEW', 'REPORTING', 'COMPETITOR_RESEARCH', 'SOCIAL_LISTENING', 'BRAND_MONITORING', 'GENERAL');

-- CreateEnum
CREATE TYPE "SmoisTaskStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmoisTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SmoisRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SOCIAL_MEDIA';

-- CreateTable
CREATE TABLE "smois_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SmoisRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "jobTitle" TEXT,
    "responsibilities" TEXT,
    "supervisorId" TEXT,
    "assignedToDeptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "canEmergencyPublish" BOOLEAN NOT NULL DEFAULT false,
    "canConnectAccounts" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_accounts" (
    "id" TEXT NOT NULL,
    "platform" "SmoisPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "profileImageUrl" TEXT,
    "url" TEXT,
    "category" TEXT,
    "accountType" TEXT,
    "ownerLabel" TEXT,
    "connectionStatus" "SmoisConnectionStatus" NOT NULL DEFAULT 'MANUAL',
    "apiAuthStatus" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "description" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_assignments" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "SmoisAssignmentKind" NOT NULL DEFAULT 'SECONDARY',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "reason" TEXT,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_contents" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "categoryId" TEXT,
    "audience" TEXT,
    "format" TEXT NOT NULL DEFAULT 'TEXT',
    "keywords" TEXT[],
    "creatorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_variants" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "SmoisContentStatus" NOT NULL DEFAULT 'PLANNED',
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT[],
    "mentions" TEXT[],
    "mediaUrls" JSONB NOT NULL DEFAULT '[]',
    "linkUrl" TEXT,
    "plannedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "creatorId" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "assignedReviewerId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "publishedById" TEXT,
    "publishMechanism" TEXT,
    "emergencyBypass" BOOLEAN NOT NULL DEFAULT false,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_variant_versions" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "mentions" TEXT[],
    "mediaUrls" JSONB NOT NULL,
    "linkUrl" TEXT,
    "plannedAt" TIMESTAMP(3),
    "editorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_variant_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_reviews" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "SmoisReviewDecision" NOT NULL,
    "comments" TEXT,
    "rejectionReason" TEXT,
    "versionReviewed" INTEGER NOT NULL,
    "emergencyBypass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_comments" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_publish_attempts" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "mechanism" TEXT NOT NULL DEFAULT 'MANUAL',
    "initiatedById" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "publishedUrl" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "recovery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_tasks" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "SmoisTaskType" NOT NULL DEFAULT 'GENERAL',
    "priority" "SmoisTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SmoisTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "accountId" TEXT,
    "startsAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "expectedDeliverable" TEXT,
    "completionCriteria" TEXT,
    "completedAt" TIMESTAMP(3),
    "ruleId" TEXT,
    "occurrenceKey" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_task_supporters" (
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "smois_task_supporters_pkey" PRIMARY KEY ("taskId","memberId")
);

-- CreateTable
CREATE TABLE "smois_task_evidence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "note" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_task_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_task_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "SmoisTaskStatus",
    "toStatus" "SmoisTaskStatus" NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_task_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_recurring_rules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "SmoisTaskType" NOT NULL DEFAULT 'GENERAL',
    "priority" "SmoisTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "recurrence" "SmoisRecurrence" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "dueAfterHours" INTEGER NOT NULL DEFAULT 24,
    "assigneeId" TEXT,
    "accountId" TEXT,
    "expectedDeliverable" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "lastGeneratedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
    "minPostGapMinutes" INTEGER NOT NULL DEFAULT 30,
    "approvalReminderHours" INTEGER NOT NULL DEFAULT 24,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smois_members_userId_key" ON "smois_members"("userId");

-- CreateIndex
CREATE INDEX "smois_members_role_isActive_idx" ON "smois_members"("role", "isActive");

-- CreateIndex
CREATE INDEX "smois_accounts_platform_archivedAt_idx" ON "smois_accounts"("platform", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_accounts_platform_handle_key" ON "smois_accounts"("platform", "handle");

-- CreateIndex
CREATE INDEX "smois_assignments_accountId_endsAt_idx" ON "smois_assignments"("accountId", "endsAt");

-- CreateIndex
CREATE INDEX "smois_assignments_memberId_endsAt_idx" ON "smois_assignments"("memberId", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_categories_name_key" ON "smois_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "smois_contents_number_key" ON "smois_contents"("number");

-- CreateIndex
CREATE INDEX "smois_contents_creatorId_idx" ON "smois_contents"("creatorId");

-- CreateIndex
CREATE INDEX "smois_contents_archivedAt_createdAt_idx" ON "smois_contents"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "smois_variants_accountId_status_idx" ON "smois_variants"("accountId", "status");

-- CreateIndex
CREATE INDEX "smois_variants_status_scheduledAt_idx" ON "smois_variants"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "smois_variants_contentId_idx" ON "smois_variants"("contentId");

-- CreateIndex
CREATE INDEX "smois_variants_creatorId_idx" ON "smois_variants"("creatorId");

-- CreateIndex
CREATE INDEX "smois_variants_publishedAt_idx" ON "smois_variants"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_variant_versions_variantId_version_key" ON "smois_variant_versions"("variantId", "version");

-- CreateIndex
CREATE INDEX "smois_reviews_variantId_createdAt_idx" ON "smois_reviews"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_reviews_reviewerId_createdAt_idx" ON "smois_reviews"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_comments_variantId_createdAt_idx" ON "smois_comments"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_publish_attempts_variantId_createdAt_idx" ON "smois_publish_attempts"("variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_tasks_number_key" ON "smois_tasks"("number");

-- CreateIndex
CREATE INDEX "smois_tasks_assigneeId_status_idx" ON "smois_tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "smois_tasks_status_deadline_idx" ON "smois_tasks"("status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "smois_tasks_ruleId_occurrenceKey_key" ON "smois_tasks"("ruleId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "smois_task_evidence_taskId_idx" ON "smois_task_evidence"("taskId");

-- CreateIndex
CREATE INDEX "smois_task_comments_taskId_createdAt_idx" ON "smois_task_comments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_task_history_taskId_createdAt_idx" ON "smois_task_history"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "smois_members" ADD CONSTRAINT "smois_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_members" ADD CONSTRAINT "smois_members_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "smois_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_assignments" ADD CONSTRAINT "smois_assignments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_assignments" ADD CONSTRAINT "smois_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "smois_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_contents" ADD CONSTRAINT "smois_contents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "smois_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_variants" ADD CONSTRAINT "smois_variants_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "smois_contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_variants" ADD CONSTRAINT "smois_variants_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_variant_versions" ADD CONSTRAINT "smois_variant_versions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "smois_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_reviews" ADD CONSTRAINT "smois_reviews_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "smois_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_comments" ADD CONSTRAINT "smois_comments_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "smois_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_publish_attempts" ADD CONSTRAINT "smois_publish_attempts_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "smois_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_tasks" ADD CONSTRAINT "smois_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "smois_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_tasks" ADD CONSTRAINT "smois_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "smois_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_tasks" ADD CONSTRAINT "smois_tasks_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_tasks" ADD CONSTRAINT "smois_tasks_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "smois_recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_task_supporters" ADD CONSTRAINT "smois_task_supporters_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "smois_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_task_supporters" ADD CONSTRAINT "smois_task_supporters_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "smois_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_task_evidence" ADD CONSTRAINT "smois_task_evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "smois_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_task_comments" ADD CONSTRAINT "smois_task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "smois_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_task_history" ADD CONSTRAINT "smois_task_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "smois_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Activity trail is append-only: SMOIS audit rows can never be edited or deleted.
CREATE OR REPLACE FUNCTION smois_audit_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."entity" LIKE 'Smois%' THEN
    RAISE EXCEPTION 'SMOIS activity records are append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER smois_audit_no_update BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION smois_audit_immutable();
CREATE TRIGGER smois_audit_no_delete BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION smois_audit_immutable();

-- Defaults
INSERT INTO "smois_settings" ("id", "updatedAt") VALUES ('default', NOW()) ON CONFLICT DO NOTHING;
INSERT INTO "smois_categories" ("id", "name", "sortOrder") VALUES
  (gen_random_uuid()::text, 'Brand awareness', 1),
  (gen_random_uuid()::text, 'Educational content', 2),
  (gen_random_uuid()::text, 'Product promotion', 3),
  (gen_random_uuid()::text, 'Company announcements', 4),
  (gen_random_uuid()::text, 'Corporate milestones', 5),
  (gen_random_uuid()::text, 'Customer testimonials', 6),
  (gen_random_uuid()::text, 'Engagement content', 7),
  (gen_random_uuid()::text, 'Recruitment', 8),
  (gen_random_uuid()::text, 'Events', 9),
  (gen_random_uuid()::text, 'Thought leadership', 10),
  (gen_random_uuid()::text, 'Public relations', 11),
  (gen_random_uuid()::text, 'Behind-the-scenes', 12),
  (gen_random_uuid()::text, 'Industry news', 13),
  (gen_random_uuid()::text, 'Partnership announcements', 14)
ON CONFLICT DO NOTHING;
