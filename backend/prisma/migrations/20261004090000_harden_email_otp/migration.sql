-- Email OTPs are now stored only as an HMAC (codeHash) with an attempt counter.
-- Existing plaintext codes cannot be converted, so they are discarded: anyone
-- mid-verification at deploy time simply taps "Resend" (codes live 10 min anyway).
DELETE FROM "email_otps";

-- AlterTable
ALTER TABLE "email_otps" DROP COLUMN "code",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "email_otps_userId_createdAt_idx" ON "email_otps"("userId", "createdAt");
