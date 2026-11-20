-- CreateEnum
CREATE TYPE "PwmLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "pwm_employees" ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "pwm_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "pwm_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_leave_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "accrual" TEXT NOT NULL DEFAULT 'UPFRONT',
    "afterProbationOnly" BOOLEAN NOT NULL DEFAULT false,
    "minTenureMonths" INTEGER NOT NULL DEFAULT 0,
    "carryOverCap" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "docAfterDays" INTEGER,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "approvalChain" JSONB NOT NULL,
    "setsOnLeaveStatus" BOOLEAN NOT NULL DEFAULT false,
    "countsWeekends" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pwm_leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_leave_balances" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "carriedOver" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "used" DECIMAL(6,1) NOT NULL DEFAULT 0,

    CONSTRAINT "pwm_leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_leave_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startHalf" BOOLEAN NOT NULL DEFAULT false,
    "endHalf" BOOLEAN NOT NULL DEFAULT false,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "docUrl" TEXT,
    "handoverEmployeeId" TEXT,
    "status" "PwmLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "requestedById" TEXT,
    "cancelReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_leave_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "approverUserId" TEXT,
    "decision" TEXT,
    "note" TEXT,
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),

    CONSTRAINT "pwm_leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_leave_adjustments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "delta" DECIMAL(6,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "workDays" JSONB NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pwm_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "minutesLate" INTEGER NOT NULL DEFAULT 0,
    "minutesEarly" INTEGER NOT NULL DEFAULT 0,
    "minutesWorked" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pwm_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_attendance_corrections" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "originalIn" TIMESTAMP(3),
    "originalOut" TIMESTAMP(3),
    "requestedIn" TIMESTAMP(3),
    "requestedOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "PwmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_overtime" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(4,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PwmApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverUserId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_overtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_review_cycles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_reviews" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SELF',
    "selfRating" INTEGER,
    "selfComment" TEXT,
    "selfAt" TIMESTAMP(3),
    "managerRating" INTEGER,
    "managerComment" TEXT,
    "strengths" TEXT,
    "improvements" TEXT,
    "summary" TEXT,
    "managerAt" TIMESTAMP(3),
    "discussedAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "ackComment" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_objectives" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "measure" TEXT,
    "target" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_feedback_notes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sharedWithEmployee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_feedback_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pwm_improvement_plans" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "reviewDate" DATE NOT NULL,
    "objectives" TEXT NOT NULL,
    "support" TEXT,
    "milestones" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "outcomeNote" TEXT,
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pwm_improvement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pwm_holidays_date_name_key" ON "pwm_holidays"("date", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_leave_types_key_key" ON "pwm_leave_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_leave_balances_employeeId_typeId_year_key" ON "pwm_leave_balances"("employeeId", "typeId", "year");

-- CreateIndex
CREATE INDEX "pwm_leave_requests_employeeId_startDate_idx" ON "pwm_leave_requests"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "pwm_leave_requests_status_idx" ON "pwm_leave_requests"("status");

-- CreateIndex
CREATE INDEX "pwm_leave_approvals_requestId_idx" ON "pwm_leave_approvals"("requestId");

-- CreateIndex
CREATE INDEX "pwm_leave_approvals_approverUserId_idx" ON "pwm_leave_approvals"("approverUserId");

-- CreateIndex
CREATE INDEX "pwm_leave_adjustments_employeeId_idx" ON "pwm_leave_adjustments"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_schedules_name_key" ON "pwm_schedules"("name");

-- CreateIndex
CREATE INDEX "pwm_attendance_date_status_idx" ON "pwm_attendance"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_attendance_employeeId_date_key" ON "pwm_attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "pwm_attendance_corrections_status_idx" ON "pwm_attendance_corrections"("status");

-- CreateIndex
CREATE INDEX "pwm_overtime_status_idx" ON "pwm_overtime"("status");

-- CreateIndex
CREATE INDEX "pwm_reviews_status_idx" ON "pwm_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pwm_reviews_cycleId_employeeId_key" ON "pwm_reviews"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "pwm_objectives_employeeId_idx" ON "pwm_objectives"("employeeId");

-- CreateIndex
CREATE INDEX "pwm_objectives_departmentId_idx" ON "pwm_objectives"("departmentId");

-- CreateIndex
CREATE INDEX "pwm_feedback_notes_employeeId_createdAt_idx" ON "pwm_feedback_notes"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "pwm_improvement_plans_employeeId_idx" ON "pwm_improvement_plans"("employeeId");

-- AddForeignKey
ALTER TABLE "pwm_employees" ADD CONSTRAINT "pwm_employees_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "pwm_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_leave_balances" ADD CONSTRAINT "pwm_leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_leave_balances" ADD CONSTRAINT "pwm_leave_balances_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "pwm_leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_leave_requests" ADD CONSTRAINT "pwm_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_leave_requests" ADD CONSTRAINT "pwm_leave_requests_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "pwm_leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_leave_approvals" ADD CONSTRAINT "pwm_leave_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "pwm_leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_attendance" ADD CONSTRAINT "pwm_attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_attendance_corrections" ADD CONSTRAINT "pwm_attendance_corrections_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_overtime" ADD CONSTRAINT "pwm_overtime_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_reviews" ADD CONSTRAINT "pwm_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "pwm_review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_reviews" ADD CONSTRAINT "pwm_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pwm_objectives" ADD CONSTRAINT "pwm_objectives_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "pwm_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

