-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "selections" JSONB;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "selections" JSONB;
