-- CreateEnum
CREATE TYPE "OnboardingEventType" AS ENUM ('SIGNED_UP', 'EMAIL_VERIFIED', 'VENDOR_PROFILE_COMPLETED', 'DOCUMENTS_SUBMITTED', 'APPROVED', 'FIRST_ORDER');

-- CreateTable
CREATE TABLE "onboarding_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "event" "OnboardingEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_events_role_event_idx" ON "onboarding_events"("role", "event");

-- CreateIndex
CREATE INDEX "onboarding_events_createdAt_idx" ON "onboarding_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_events_userId_event_key" ON "onboarding_events"("userId", "event");

-- AddForeignKey
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
