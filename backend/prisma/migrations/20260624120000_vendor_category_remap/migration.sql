-- Rename GROCERY → EMART and drop HOME_KITCHEN, BEAUTY, ERRAND from VendorCategory.
--
-- PostgreSQL does not support ALTER TYPE ... ADD VALUE then USE the new value in
-- the same transaction. The safe workaround:
--   1. Copy category data to a TEXT column (no enum dependency).
--   2. Drop the old typed column → enum type has no more dependents.
--   3. DROP the old enum, CREATE the new one with only the 3 final values.
--   4. Re-add the typed column from the TEXT copy (new values are immediately
--      visible within the same transaction because WE just created the type).
--   5. Drop the TEXT staging column.

-- Step 1: Staging column – map old values to their new equivalents.
ALTER TABLE "vendors" ADD COLUMN "category_text" TEXT;
UPDATE "vendors" SET "category_text" = CASE
  WHEN category::text = 'GROCERY'                          THEN 'EMART'
  WHEN category::text IN ('HOME_KITCHEN','BEAUTY','ERRAND') THEN 'RESTAURANT'
  ELSE category::text                                       -- RESTAURANT, PHARMACY unchanged
END;

-- Step 2: Remove the old typed column (breaks the dependency on the old enum).
ALTER TABLE "vendors" DROP COLUMN "category";

-- Step 3: Swap the enum type.
DROP TYPE "VendorCategory";
CREATE TYPE "VendorCategory" AS ENUM ('RESTAURANT', 'EMART', 'PHARMACY');

-- Step 4: Restore the typed column from the staging data.
ALTER TABLE "vendors" ADD COLUMN "category" "VendorCategory";
UPDATE "vendors" SET "category" = "category_text"::"VendorCategory";
ALTER TABLE "vendors" ALTER COLUMN "category" SET NOT NULL;

-- Step 5: Clean up.
ALTER TABLE "vendors" DROP COLUMN "category_text";
