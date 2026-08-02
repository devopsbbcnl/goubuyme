-- Add four new vendor types to VendorCategory: BAKERY, DRINKS, BUTCHER, GAS.
--
-- Unlike the earlier `vendor_category_remap` migration (which removed/renamed
-- values and therefore had to rebuild the enum), we are only ADDING values.
-- PostgreSQL 12+ allows `ALTER TYPE ... ADD VALUE` inside a transaction as long
-- as the new value is not referenced in the same transaction — which it is not
-- here — so these run safely under Prisma's transactional migrate.

-- AlterEnum
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BAKERY';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'DRINKS';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'BUTCHER';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'GAS';
