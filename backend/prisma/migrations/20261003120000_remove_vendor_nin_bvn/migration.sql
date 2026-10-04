-- NDPA data minimisation: vendors are no longer asked for NIN or BVN.
--
-- DESTRUCTIVE: permanently deletes every vendor identity document of type NIN
-- (the raw NIN plus its Cloudinary image/selfie URLs) and all stored vendor BVNs
-- and director NINs. Affected vendors keep their approval status but will need to
-- upload a driver's licence or passport if an ID document is still required.
-- The images themselves stay in Cloudinary and must be deleted there separately.

-- Rows of the removed enum value cannot be cast to the new enum.
DELETE FROM "vendor_documents" WHERE "type" = 'NIN';

-- AlterEnum
BEGIN;
CREATE TYPE "DocumentType_new" AS ENUM ('DRIVERS_LICENSE', 'PASSPORT');
ALTER TABLE "vendor_documents" ALTER COLUMN "type" TYPE "DocumentType_new" USING ("type"::text::"DocumentType_new");
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "DocumentType_old";
COMMIT;

-- AlterTable
ALTER TABLE "vendor_business_verifications" DROP COLUMN "directorNin";

-- AlterTable
ALTER TABLE "vendor_documents" DROP COLUMN "bvn";
