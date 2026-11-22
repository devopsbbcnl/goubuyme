-- NDPA register G5/G6: marketing consent must be an explicit choice, and acceptance of the terms/privacy
-- policy must be provable (when, and which version).
--
-- Existing accounts keep their current marketingOptIn value (changing it silently would stop promotions to
-- everyone). Rows with marketingOptIn = true and no marketingConsentAt are legacy opt-ins we cannot prove.

ALTER TABLE "users" ALTER COLUMN "marketingOptIn" SET DEFAULT false;
ALTER TABLE "users" ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "marketingConsentSource" TEXT;
ALTER TABLE "users" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "policyVersion" TEXT;
