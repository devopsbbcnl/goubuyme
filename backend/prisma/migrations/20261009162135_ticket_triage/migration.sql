-- AlterTable
ALTER TABLE "agent_suggestions" ADD COLUMN     "ticketId" TEXT;

-- CreateIndex
CREATE INDEX "agent_suggestions_ticketId_idx" ON "agent_suggestions"("ticketId");
