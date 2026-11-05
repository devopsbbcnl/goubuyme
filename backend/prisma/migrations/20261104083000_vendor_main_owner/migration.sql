-- A branch is a vendor row owned by the same account as its main business, so "userId" can no
-- longer be unique. "mainOwnerId" is the unique link for the main business only: it equals userId
-- on a main business and is NULL on a branch, so the database still guarantees one main business
-- per account (NULLs do not collide in a unique index).

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "mainOwnerId" TEXT;

-- Existing vendors are all main businesses (one per account until now).
UPDATE "vendors" SET "mainOwnerId" = "userId" WHERE "parentVendorId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "vendors_mainOwnerId_key" ON "vendors"("mainOwnerId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_mainOwnerId_fkey" FOREIGN KEY ("mainOwnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep mainOwnerId in step on every insert/update path (API, admin tools, seed scripts) so no
-- caller has to know about it.
CREATE OR REPLACE FUNCTION vendors_sync_main_owner() RETURNS trigger AS $$
BEGIN
  IF NEW."parentVendorId" IS NULL THEN
    NEW."mainOwnerId" := NEW."userId";
  ELSE
    NEW."mainOwnerId" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendors_sync_main_owner
BEFORE INSERT OR UPDATE OF "userId", "parentVendorId" ON "vendors"
FOR EACH ROW EXECUTE FUNCTION vendors_sync_main_owner();
