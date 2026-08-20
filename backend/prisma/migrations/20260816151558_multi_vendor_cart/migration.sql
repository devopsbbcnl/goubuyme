-- Backfill vendorId for any legacy cart row that has items but no vendorId set
UPDATE "carts" c
SET "vendorId" = sub."vendorId"
FROM (
  SELECT DISTINCT ON (ci."cartId") ci."cartId", mi."vendorId"
  FROM "cart_items" ci
  JOIN "menu_items" mi ON mi."id" = ci."menuItemId"
) sub
WHERE c."id" = sub."cartId" AND c."vendorId" IS NULL;

-- Drop any remaining vendor-less carts (empty carts with nothing to infer a vendor from)
DELETE FROM "carts" WHERE "vendorId" IS NULL;

-- Make vendorId required
ALTER TABLE "carts" ALTER COLUMN "vendorId" SET NOT NULL;

-- Swap the single-column unique index for a composite (customerId, vendorId) unique index
DROP INDEX IF EXISTS "carts_customerId_key";
CREATE UNIQUE INDEX "carts_customerId_vendorId_key" ON "carts"("customerId", "vendorId");
