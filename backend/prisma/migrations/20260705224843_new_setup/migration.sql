-- CreateIndex
CREATE INDEX "vendors_category_idx" ON "vendors"("category");

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
