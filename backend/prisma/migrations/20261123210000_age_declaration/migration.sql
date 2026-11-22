-- NDPA register G16 / F13: sign-up must record that the person declared they are 18 or older.
-- Existing accounts stay null: we hold no declaration for them and do not invent one.

ALTER TABLE "users" ADD COLUMN "ageConfirmedAt" TIMESTAMP(3);
