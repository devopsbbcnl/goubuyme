-- CreateEnum
CREATE TYPE "PwmVacancyStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'OPEN', 'ON_HOLD', 'FILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PwmApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'STAFF';

-- CreateTable
CREATE TABLE "pwm_vacancies" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "hiringManagerId" TEXT,
    "employmentType" TEXT NOT NULL,
    "location" TEXT,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "requirements" TEXT,
    "status" "PwmVacancyStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "closingDate" DATE,
    "openedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_candidates" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "cvUrl" TEXT,
    "notes" TEXT,
    "consentAt" TIMESTAMP(3),
    "anonymisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_applications" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stage" "PwmApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "rating" INTEGER,
    "notes" TEXT,
    "coverNote" TEXT,
    "rejectionReason" TEXT,
    "offerNotes" TEXT,
    "offeredAt" TIMESTAMP(3),
    "hiredEmployeeId" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_interviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT,
    "panelUserIds" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "feedback" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_policies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT,
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" DATE,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_policy_acks" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "pwm_policy_acks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "departmentIds" JSONB,
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_exit_interviews" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "episode" INTEGER NOT NULL DEFAULT 1,
    "reasonCategory" TEXT,
    "wouldRecommend" BOOLEAN,
    "answers" JSONB,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "conductedById" TEXT,
    "conductedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_exit_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_clearances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "episode" INTEGER NOT NULL DEFAULT 1,
    "area" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "pwm_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_change_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadEnc" TEXT NOT NULL,
    "status" "PwmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_preboarding" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "otpHash" TEXT,
    "otpExpires" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_preboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pwm_vacancies_reference_key" ON "pwm_vacancies"("reference");

-- CreateIndex
CREATE INDEX "pwm_vacancies_status_idx" ON "pwm_vacancies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_candidates_email_key" ON "pwm_candidates"("email");

-- CreateIndex
CREATE INDEX "pwm_applications_vacancyId_stage_idx" ON "pwm_applications"("vacancyId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_applications_vacancyId_candidateId_key" ON "pwm_applications"("vacancyId", "candidateId");

-- CreateIndex
CREATE INDEX "pwm_interviews_applicationId_idx" ON "pwm_interviews"("applicationId");

-- CreateIndex
CREATE INDEX "pwm_interviews_scheduledAt_idx" ON "pwm_interviews"("scheduledAt");

-- CreateIndex
CREATE INDEX "pwm_policies_status_idx" ON "pwm_policies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_policies_slug_version_key" ON "pwm_policies"("slug", "version");

-- CreateIndex
CREATE INDEX "pwm_policy_acks_employeeId_idx" ON "pwm_policy_acks"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_policy_acks_policyId_employeeId_key" ON "pwm_policy_acks"("policyId", "employeeId");

-- CreateIndex
CREATE INDEX "pwm_announcements_publishAt_idx" ON "pwm_announcements"("publishAt");

-- CreateIndex
CREATE INDEX "pwm_templates_status_kind_idx" ON "pwm_templates"("status", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_templates_slug_version_key" ON "pwm_templates"("slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_exit_interviews_employeeId_episode_key" ON "pwm_exit_interviews"("employeeId", "episode");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_clearances_employeeId_episode_area_key" ON "pwm_clearances"("employeeId", "episode", "area");

-- CreateIndex
CREATE INDEX "pwm_change_requests_status_idx" ON "pwm_change_requests"("status");

-- CreateIndex
CREATE INDEX "pwm_change_requests_employeeId_idx" ON "pwm_change_requests"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_preboarding_tokenHash_key" ON "pwm_preboarding"("tokenHash");

-- CreateIndex
CREATE INDEX "pwm_preboarding_employeeId_idx" ON "pwm_preboarding"("employeeId");

-- AddForeignKey
ALTER TABLE "pwm_applications" ADD CONSTRAINT "pwm_applications_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "pwm_vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_applications" ADD CONSTRAINT "pwm_applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "pwm_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_interviews" ADD CONSTRAINT "pwm_interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "pwm_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_policy_acks" ADD CONSTRAINT "pwm_policy_acks_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "pwm_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

