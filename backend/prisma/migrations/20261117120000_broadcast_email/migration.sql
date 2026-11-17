-- Email as a broadcast channel, and logistics companies as an audience.
ALTER TYPE "BroadcastAudience" ADD VALUE 'LOGISTICS_COMPANIES';

CREATE TYPE "BroadcastEmailType" AS ENUM ('SERVICE', 'PROMOTIONAL');

ALTER TABLE "broadcasts"
  ADD COLUMN "sendInApp" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sendEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailType" "BroadcastEmailType",
  ADD COLUMN "emailBody" TEXT,
  ADD COLUMN "emailCount" INTEGER NOT NULL DEFAULT 0;
