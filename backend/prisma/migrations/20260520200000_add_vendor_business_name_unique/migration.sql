-- AlterTable: add unique constraint on vendors.businessName
CREATE UNIQUE INDEX "vendors_businessName_key" ON "vendors"("businessName");
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_businessName_key" UNIQUE USING INDEX "vendors_businessName_key";
