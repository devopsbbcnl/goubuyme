-- CreateTable
CREATE TABLE "pwm_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'ONLINE',
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "durationHours" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_enrolments" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "assigned" BOOLEAN NOT NULL DEFAULT false,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "approverUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "completedAt" TIMESTAMP(3),
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_training_budgets" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "pwm_training_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_development_plans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "actions" JSONB,
    "reviewDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_development_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "pwm_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_skill_assessments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "assessedById" TEXT,
    "note" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_skill_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_position_skills" (
    "id" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL,

    CONSTRAINT "pwm_position_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_assets" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serial" TEXT,
    "purchaseDate" DATE,
    "cost" DECIMAL(14,2),
    "supplier" TEXT,
    "warrantyExpiry" DATE,
    "location" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "seats" INTEGER,
    "expiries" JSONB,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_asset_assignments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "conditionOut" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "conditionIn" TEXT,
    "receivedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,

    CONSTRAINT "pwm_asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_asset_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "cost" DECIMAL(12,2),
    "recovery" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_cases" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "summary" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'INTAKE',
    "responseDue" DATE,
    "hearingAt" TIMESTAMP(3),
    "appealDue" DATE,
    "outcome" TEXT,
    "outcomeNote" TEXT,
    "warningExpiresAt" DATE,
    "raisedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_case_handlers" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'HANDLER',
    "recusedAt" TIMESTAMP(3),
    "recusalReason" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_case_handlers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_case_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fileUrl" TEXT,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_recognitions" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "citation" TEXT,
    "date" DATE NOT NULL,
    "givenById" TEXT,
    "announced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_recognitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_surveys" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL,
    "departmentIds" JSONB,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_survey_responses" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_survey_participation" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_survey_participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_expense_claims" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "travelRequestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approverUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_expense_items" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "exception" TEXT,

    CONSTRAINT "pwm_expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_travel_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "estimatedCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "perDiem" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pwm_enrolments_employeeId_idx" ON "pwm_enrolments"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_enrolments_courseId_status_idx" ON "pwm_enrolments"("courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_training_budgets_departmentId_year_key" ON "pwm_training_budgets"("departmentId", "year");

-- CreateIndex
CREATE INDEX "pwm_development_plans_employeeId_idx" ON "pwm_development_plans"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_skills_name_key" ON "pwm_skills"("name");

-- CreateIndex
CREATE INDEX "pwm_skill_assessments_employeeId_skillId_assessedAt_idx" ON "pwm_skill_assessments"("employeeId", "skillId", "assessedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_position_skills_jobTitle_skillId_key" ON "pwm_position_skills"("jobTitle", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_assets_tag_key" ON "pwm_assets"("tag");

-- CreateIndex
CREATE INDEX "pwm_assets_status_idx" ON "pwm_assets"("status");

-- CreateIndex
CREATE INDEX "pwm_asset_assignments_employeeId_status_idx" ON "pwm_asset_assignments"("employeeId", "status");

-- CreateIndex
CREATE INDEX "pwm_asset_assignments_assetId_idx" ON "pwm_asset_assignments"("assetId");

-- CreateIndex
CREATE INDEX "pwm_asset_events_assetId_createdAt_idx" ON "pwm_asset_events"("assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_cases_reference_key" ON "pwm_cases"("reference");

-- CreateIndex
CREATE INDEX "pwm_cases_employeeId_idx" ON "pwm_cases"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_cases_stage_idx" ON "pwm_cases"("stage");

-- CreateIndex
CREATE INDEX "pwm_case_handlers_userId_idx" ON "pwm_case_handlers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_case_handlers_caseId_userId_key" ON "pwm_case_handlers"("caseId", "userId");

-- CreateIndex
CREATE INDEX "pwm_case_events_caseId_createdAt_idx" ON "pwm_case_events"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "pwm_recognitions_employeeId_idx" ON "pwm_recognitions"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_survey_responses_surveyId_idx" ON "pwm_survey_responses"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_survey_participation_surveyId_employeeId_key" ON "pwm_survey_participation"("surveyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_expense_claims_reference_key" ON "pwm_expense_claims"("reference");

-- CreateIndex
CREATE INDEX "pwm_expense_claims_employeeId_idx" ON "pwm_expense_claims"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_expense_claims_status_idx" ON "pwm_expense_claims"("status");

-- CreateIndex
CREATE INDEX "pwm_expense_items_claimId_idx" ON "pwm_expense_items"("claimId");

-- CreateIndex
CREATE INDEX "pwm_travel_requests_employeeId_idx" ON "pwm_travel_requests"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_travel_requests_status_idx" ON "pwm_travel_requests"("status");

-- AddForeignKey
ALTER TABLE "pwm_enrolments" ADD CONSTRAINT "pwm_enrolments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "pwm_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_enrolments" ADD CONSTRAINT "pwm_enrolments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_development_plans" ADD CONSTRAINT "pwm_development_plans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_skill_assessments" ADD CONSTRAINT "pwm_skill_assessments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_skill_assessments" ADD CONSTRAINT "pwm_skill_assessments_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "pwm_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_position_skills" ADD CONSTRAINT "pwm_position_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "pwm_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_asset_assignments" ADD CONSTRAINT "pwm_asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "pwm_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_asset_assignments" ADD CONSTRAINT "pwm_asset_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_asset_events" ADD CONSTRAINT "pwm_asset_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "pwm_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_cases" ADD CONSTRAINT "pwm_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_case_handlers" ADD CONSTRAINT "pwm_case_handlers_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "pwm_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_case_events" ADD CONSTRAINT "pwm_case_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "pwm_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_recognitions" ADD CONSTRAINT "pwm_recognitions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_survey_responses" ADD CONSTRAINT "pwm_survey_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "pwm_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_survey_participation" ADD CONSTRAINT "pwm_survey_participation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "pwm_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_expense_claims" ADD CONSTRAINT "pwm_expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_expense_items" ADD CONSTRAINT "pwm_expense_items_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "pwm_expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_travel_requests" ADD CONSTRAINT "pwm_travel_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

