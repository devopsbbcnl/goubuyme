-- CreateTable
CREATE TABLE "menu_item_drink_options" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_drink_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_drink_options_menuItemId_idx" ON "menu_item_drink_options"("menuItemId");

-- AddForeignKey
ALTER TABLE "menu_item_drink_options" ADD CONSTRAINT "menu_item_drink_options_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
