-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');

-- CreateEnum
CREATE TYPE "AgentSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actorType" "OrderActorType" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "agentKey" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "agent_configs" (
    "key" TEXT NOT NULL,
    "mode" "AgentMode" NOT NULL DEFAULT 'SUGGEST',
    "autoActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "agent_suggestions" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "orderId" TEXT,
    "status" "AgentSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "autoExecuted" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_suggestions_dedupeKey_key" ON "agent_suggestions"("dedupeKey");

-- CreateIndex
CREATE INDEX "agent_suggestions_status_createdAt_idx" ON "agent_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_suggestions_agentKey_createdAt_idx" ON "agent_suggestions"("agentKey", "createdAt");

-- CreateIndex
CREATE INDEX "agent_suggestions_orderId_idx" ON "agent_suggestions"("orderId");

-- CreateIndex
CREATE INDEX "audit_logs_agentKey_createdAt_idx" ON "audit_logs"("agentKey", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
