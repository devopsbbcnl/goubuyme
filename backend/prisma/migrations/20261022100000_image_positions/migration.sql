-- Where each uploaded image's crop sits in its frame, a CSS object-position pair
-- ("50% 30%") the owner drags into place. Null is centred.
ALTER TABLE "users" ADD COLUMN "avatarPosition" TEXT;
ALTER TABLE "vendors" ADD COLUMN "logoPosition" TEXT;
ALTER TABLE "vendors" ADD COLUMN "coverPosition" TEXT;
ALTER TABLE "menu_items" ADD COLUMN "imagePosition" TEXT;
ALTER TABLE "vendor_promotions" ADD COLUMN "imagePosition" TEXT;
