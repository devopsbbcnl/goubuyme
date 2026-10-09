-- CreateTable
CREATE TABLE "ops_briefings" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "summary" JSONB,
    "analyzedBy" TEXT NOT NULL,
    "model" TEXT,
    "html" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ops_briefings_day_key" ON "ops_briefings"("day");
