-- AlterEnum
ALTER TYPE "BroadcastAudience" ADD VALUE 'USER';

-- AlterTable
ALTER TABLE "broadcasts" ADD COLUMN "targetUserId" TEXT;

-- CreateIndex
CREATE INDEX "broadcasts_targetUserId_idx" ON "broadcasts"("targetUserId");

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
