CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "platformName" TEXT NOT NULL DEFAULT 'GoBuyMe',
  "supportEmail" TEXT NOT NULL DEFAULT 'support@gobuyme.shop',
  "deliveryBaseFee" DOUBLE PRECISION NOT NULL DEFAULT 500,
  "deliveryPerKmRate" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "deliveryMaxFee" DOUBLE PRECISION NOT NULL DEFAULT 3000,
  "maxDeliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 25,
  "cancellationWindowMinutes" INTEGER NOT NULL DEFAULT 10,
  "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_settings" (
  "id",
  "platformName",
  "supportEmail",
  "deliveryBaseFee",
  "deliveryPerKmRate",
  "deliveryMaxFee",
  "maxDeliveryRadiusKm",
  "cancellationWindowMinutes",
  "maintenanceMode",
  "updatedAt",
  "createdAt"
) VALUES (
  'default',
  'GoBuyMe',
  'support@gobuyme.shop',
  500,
  100,
  3000,
  25,
  10,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
