-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('STATUS_CHANGED', 'RIDER_ASSIGNED', 'RIDER_UNASSIGNED', 'CREDIT_ISSUED');

-- CreateEnum
CREATE TYPE "OrderActorType" AS ENUM ('CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'SYSTEM', 'AGENT');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "riderAssignedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "actorType" "OrderActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_events_type_createdAt_idx" ON "order_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_statusChangedAt_idx" ON "orders"("status", "statusChangedAt");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
