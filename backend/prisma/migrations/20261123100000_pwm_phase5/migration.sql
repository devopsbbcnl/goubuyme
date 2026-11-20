-- PWM Phase 5: workforce planning and succession
CREATE TABLE "pwm_headcount_plans" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "departmentId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "planned" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pwm_headcount_plans_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "pwm_key_positions" (
    "id" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "departmentId" TEXT,
    "incumbentId" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pwm_key_positions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "pwm_successors" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "developmentNote" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pwm_successors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pwm_headcount_plans_year_status_idx" ON "pwm_headcount_plans"("year", "status");
CREATE UNIQUE INDEX "pwm_headcount_plans_year_departmentId_jobTitle_key" ON "pwm_headcount_plans"("year", "departmentId", "jobTitle");
CREATE INDEX "pwm_key_positions_archivedAt_idx" ON "pwm_key_positions"("archivedAt");
CREATE UNIQUE INDEX "pwm_successors_positionId_employeeId_key" ON "pwm_successors"("positionId", "employeeId");
ALTER TABLE "pwm_successors" ADD CONSTRAINT "pwm_successors_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "pwm_key_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
