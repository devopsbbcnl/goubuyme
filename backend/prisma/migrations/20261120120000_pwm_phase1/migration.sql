-- CreateEnum
CREATE TYPE "PwmRole" AS ENUM ('HR_ADMIN', 'HR_OFFICER', 'DEPARTMENT_HEAD', 'EXECUTIVE', 'FINANCE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "PwmEmploymentStatus" AS ENUM ('PENDING_ONBOARDING', 'PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'CONTRACT_EXPIRED', 'RESIGNED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PwmContractStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'SIGNED', 'ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED', 'EXPIRED', 'NOT_RENEWED', 'SUPERSEDED', 'TERMINATED_EARLY', 'DECLINED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PwmApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PwmRenewalDecision" AS ENUM ('RENEW_SAME_TERMS', 'RENEW_WITH_CHANGES', 'EXTEND', 'CONVERT_TO_PERMANENT', 'DO_NOT_RENEW', 'OTHER');

-- CreateEnum
CREATE TYPE "PwmRenewalStep" AS ENUM ('RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PwmReminderStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PwmChecklistKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "PwmTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "pwm_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PwmRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "jobTitle" TEXT,
    "isMd" BOOLEAN NOT NULL DEFAULT false,
    "canViewCompensation" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pwm_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "pwm_departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" TEXT,
    "headEmployeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_employees" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "knownAs" TEXT,
    "photoUrl" TEXT,
    "dateOfBirth" DATE,
    "sex" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT,
    "stateOfOrigin" TEXT,
    "workEmail" TEXT,
    "personalEmail" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "emergencyContacts" JSONB,
    "nextOfKin" JSONB,
    "guarantors" JSONB,
    "companyEntity" TEXT NOT NULL DEFAULT 'Main',
    "departmentId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "grade" TEXT,
    "managerId" TEXT,
    "location" TEXT,
    "workArrangement" TEXT NOT NULL DEFAULT 'ON_SITE',
    "hireDate" DATE NOT NULL,
    "originalHireDate" DATE,
    "employmentType" TEXT NOT NULL,
    "status" "PwmEmploymentStatus" NOT NULL DEFAULT 'PENDING_ONBOARDING',
    "probationEndDate" DATE,
    "confirmationDate" DATE,
    "costCentre" TEXT,
    "hrOfficerUserId" TEXT,
    "nin" TEXT,
    "tin" TEXT,
    "rsaPin" TEXT,
    "pfaName" TEXT,
    "nhfNo" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankAccountName" TEXT,
    "exitType" TEXT,
    "exitDate" DATE,
    "finalWorkingDay" DATE,
    "exitReason" TEXT,
    "rehireEligible" BOOLEAN,
    "employmentEpisode" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pwm_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_status_changes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromStatus" "PwmEmploymentStatus" NOT NULL,
    "toStatus" "PwmEmploymentStatus" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT,
    "bySystem" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "PwmApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_contracts" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "departmentName" TEXT,
    "jobTitle" TEXT,
    "contractType" TEXT NOT NULL,
    "status" "PwmContractStatus" NOT NULL DEFAULT 'DRAFT',
    "commencementDate" DATE NOT NULL,
    "expiryDate" DATE,
    "renewalEligibility" TEXT NOT NULL DEFAULT 'SUBJECT_TO_REVIEW',
    "renewalEligibilityNote" TEXT,
    "probationMonths" INTEGER,
    "probationEndDate" DATE,
    "noticeValue" INTEGER,
    "noticeUnit" TEXT,
    "workingPattern" TEXT,
    "hoursPerWeek" INTEGER,
    "approvalStatus" "PwmApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "signedDate" DATE,
    "countersignedDate" DATE,
    "renewalDecision" "PwmRenewalDecision",
    "decidedById" TEXT,
    "decisionRecordedAt" TIMESTAMP(3),
    "predecessorId" TEXT,
    "templateName" TEXT,
    "responsibleOfficerUserId" TEXT,
    "isImported" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pwm_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_contract_amendments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "newExpiryDate" DATE,
    "documentUrl" TEXT,
    "documentChecksum" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "number" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "url" TEXT NOT NULL,
    "checksum" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_renewals" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "step" "PwmRenewalStep" NOT NULL DEFAULT 'RECOMMENDATION',
    "recommendation" "PwmRenewalDecision",
    "recommendationNote" TEXT,
    "recommendedById" TEXT,
    "recommendedAt" TIMESTAMP(3),
    "decision" "PwmRenewalDecision",
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "newExpiryDate" DATE,
    "successorContractId" TEXT,
    "dueRecommendation" DATE NOT NULL,
    "dueDecision" DATE NOT NULL,
    "duePreparation" DATE NOT NULL,
    "dueIssuance" DATE NOT NULL,
    "dueSignature" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_renewal_events" (
    "id" TEXT NOT NULL,
    "renewalId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_renewal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_reminder_tiers" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "tierKey" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_reminder_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_reminders" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contractId" TEXT,
    "employeeId" TEXT,
    "documentId" TEXT,
    "renewalId" TEXT,
    "tierKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "expiryDate" DATE,
    "recipientUserId" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "status" "PwmReminderStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_checklists" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "PwmChecklistKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_checklist_tasks" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerRole" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "dueDate" DATE,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "PwmTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pwm_checklist_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_compensation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "baseSalary" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "components" JSONB,
    "reason" TEXT NOT NULL,
    "approvalStatus" "PwmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "preparedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pwm_members_userId_key" ON "pwm_members"("userId");

-- CreateIndex
CREATE INDEX "pwm_members_role_isActive_idx" ON "pwm_members"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_departments_name_key" ON "pwm_departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_employees_employeeNo_key" ON "pwm_employees"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_employees_userId_key" ON "pwm_employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_employees_workEmail_key" ON "pwm_employees"("workEmail");

-- CreateIndex
CREATE INDEX "pwm_employees_status_idx" ON "pwm_employees"("status");

-- CreateIndex
CREATE INDEX "pwm_employees_departmentId_idx" ON "pwm_employees"("departmentId");

-- CreateIndex
CREATE INDEX "pwm_employees_lastName_firstName_idx" ON "pwm_employees"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "pwm_status_changes_employeeId_createdAt_idx" ON "pwm_status_changes"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "pwm_status_changes_approvalStatus_appliedAt_idx" ON "pwm_status_changes"("approvalStatus", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_contracts_reference_key" ON "pwm_contracts"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_contracts_predecessorId_key" ON "pwm_contracts"("predecessorId");

-- CreateIndex
CREATE INDEX "pwm_contracts_status_expiryDate_idx" ON "pwm_contracts"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "pwm_contracts_employeeId_idx" ON "pwm_contracts"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_contract_amendments_contractId_idx" ON "pwm_contract_amendments"("contractId");

-- CreateIndex
CREATE INDEX "pwm_documents_employeeId_kind_idx" ON "pwm_documents"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "pwm_documents_expiryDate_idx" ON "pwm_documents"("expiryDate");

-- CreateIndex
CREATE INDEX "pwm_renewals_contractId_idx" ON "pwm_renewals"("contractId");

-- CreateIndex
CREATE INDEX "pwm_renewals_step_idx" ON "pwm_renewals"("step");

-- CreateIndex
CREATE INDEX "pwm_renewal_events_renewalId_createdAt_idx" ON "pwm_renewal_events"("renewalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_reminder_tiers_contractId_tierKey_expiryDate_key" ON "pwm_reminder_tiers"("contractId", "tierKey", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_reminders_idempotencyKey_key" ON "pwm_reminders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pwm_reminders_recipientUserId_status_idx" ON "pwm_reminders"("recipientUserId", "status");

-- CreateIndex
CREATE INDEX "pwm_reminders_status_nextAttemptAt_idx" ON "pwm_reminders"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "pwm_reminders_contractId_idx" ON "pwm_reminders"("contractId");

-- CreateIndex
CREATE INDEX "pwm_checklists_employeeId_kind_idx" ON "pwm_checklists"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "pwm_checklists_status_idx" ON "pwm_checklists"("status");

-- CreateIndex
CREATE INDEX "pwm_checklist_tasks_checklistId_idx" ON "pwm_checklist_tasks"("checklistId");

-- CreateIndex
CREATE INDEX "pwm_checklist_tasks_assigneeUserId_status_idx" ON "pwm_checklist_tasks"("assigneeUserId", "status");

-- CreateIndex
CREATE INDEX "pwm_compensation_employeeId_effectiveFrom_idx" ON "pwm_compensation"("employeeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "pwm_departments" ADD CONSTRAINT "pwm_departments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "pwm_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_departments" ADD CONSTRAINT "pwm_departments_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "pwm_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_employees" ADD CONSTRAINT "pwm_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "pwm_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_employees" ADD CONSTRAINT "pwm_employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "pwm_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_status_changes" ADD CONSTRAINT "pwm_status_changes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_contracts" ADD CONSTRAINT "pwm_contracts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_contracts" ADD CONSTRAINT "pwm_contracts_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "pwm_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_contract_amendments" ADD CONSTRAINT "pwm_contract_amendments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "pwm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_documents" ADD CONSTRAINT "pwm_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_documents" ADD CONSTRAINT "pwm_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "pwm_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_renewals" ADD CONSTRAINT "pwm_renewals_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "pwm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_renewals" ADD CONSTRAINT "pwm_renewals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_renewal_events" ADD CONSTRAINT "pwm_renewal_events_renewalId_fkey" FOREIGN KEY ("renewalId") REFERENCES "pwm_renewals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_reminder_tiers" ADD CONSTRAINT "pwm_reminder_tiers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "pwm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_reminders" ADD CONSTRAINT "pwm_reminders_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "pwm_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_checklists" ADD CONSTRAINT "pwm_checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_checklist_tasks" ADD CONSTRAINT "pwm_checklist_tasks_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "pwm_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_compensation" ADD CONSTRAINT "pwm_compensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- PWM activity is append-only, like SMOIS: the same trigger now covers entities starting with Pwm.
CREATE OR REPLACE FUNCTION smois_audit_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."entity" LIKE 'Smois%' OR OLD."entity" LIKE 'Pwm%' THEN
    RAISE EXCEPTION 'SMOIS and PWM activity records are append-only';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO "pwm_settings" ("id", "updatedAt") VALUES ('default', NOW()) ON CONFLICT DO NOTHING;
