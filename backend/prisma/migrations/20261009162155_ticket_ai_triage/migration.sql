-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "aiTriage" JSONB,
ADD COLUMN     "aiTriagedAt" TIMESTAMP(3);
