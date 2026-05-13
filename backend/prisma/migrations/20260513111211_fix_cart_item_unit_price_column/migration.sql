-- Local-only fix: rename unit_price -> unitPrice (only applies if the old column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE "cart_items" RENAME COLUMN "unit_price" TO "unitPrice";
  END IF;
END $$;
