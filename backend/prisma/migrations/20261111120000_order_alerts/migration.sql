-- CreateTable
CREATE TABLE "order_alerts" (
    "id" TEXT NOT NULL,
    "orderEventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "telegramSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_alerts_orderEventId_key" ON "order_alerts"("orderEventId");

-- CreateIndex
CREATE INDEX "order_alerts_createdAt_idx" ON "order_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "order_alerts_orderId_createdAt_idx" ON "order_alerts"("orderId", "createdAt");
