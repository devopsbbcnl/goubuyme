-- AlterEnum
ALTER TYPE "LeadActivityType" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "optOutCode" TEXT,
ADD COLUMN     "tiktok" TEXT,
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "youtube" TEXT;

-- AlterTable
ALTER TABLE "prospects" ADD COLUMN     "tiktok" TEXT,
ADD COLUMN     "twitter" TEXT,
ADD COLUMN     "youtube" TEXT;

-- CreateTable
CREATE TABLE "outreach_suppressions" (
    "id" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_broadcasts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channels" "CampaignChannel"[],
    "body" TEXT NOT NULL,
    "emailSubject" TEXT,
    "ctaUrl" TEXT,
    "filters" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SENDING',
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "CampaignChannel" NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_suppressions_channel_key_key" ON "outreach_suppressions"("channel", "key");

-- CreateIndex
CREATE INDEX "lead_broadcasts_status_createdAt_idx" ON "lead_broadcasts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "lead_broadcast_recipients_broadcastId_status_idx" ON "lead_broadcast_recipients"("broadcastId", "status");

-- CreateIndex
CREATE INDEX "lead_broadcast_recipients_leadId_sentAt_idx" ON "lead_broadcast_recipients"("leadId", "sentAt");

-- CreateIndex
CREATE INDEX "lead_broadcast_recipients_channel_createdAt_idx" ON "lead_broadcast_recipients"("channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lead_broadcast_recipients_broadcastId_leadId_channel_key" ON "lead_broadcast_recipients"("broadcastId", "leadId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "leads_optOutCode_key" ON "leads"("optOutCode");

-- AddForeignKey
ALTER TABLE "lead_broadcasts" ADD CONSTRAINT "lead_broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_broadcast_recipients" ADD CONSTRAINT "lead_broadcast_recipients_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "lead_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_broadcast_recipients" ADD CONSTRAINT "lead_broadcast_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

