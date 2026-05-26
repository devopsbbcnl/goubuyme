-- CreateEnum
CREATE TYPE "PricingProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PricingZoneType" AS ENUM ('NORMAL', 'RURAL_EDGE', 'FLOOD_PRONE', 'HIGH_COST');

-- CreateEnum
CREATE TYPE "SurchargeType" AS ENUM ('RAIN', 'NIGHT_DELIVERY', 'HIGH_TRAFFIC', 'FUEL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "PricingModifierType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "pricing_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "state" TEXT,
    "city" TEXT,
    "status" "PricingProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "baseFee" DOUBLE PRECISION NOT NULL DEFAULT 700,
    "minimumFee" DOUBLE PRECISION NOT NULL DEFAULT 700,
    "maximumFee" DOUBLE PRECISION,
    "maxDeliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "freeDeliveryThreshold" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_buckets" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "minDistanceKm" DOUBLE PRECISION NOT NULL,
    "maxDistanceKm" DOUBLE PRECISION,
    "fee" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_modifiers" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "type" "PricingModifierType" NOT NULL DEFAULT 'PERCENTAGE',
    "surchargeType" "SurchargeType",
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "conditions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PricingZoneType" NOT NULL DEFAULT 'NORMAL',
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "polygonCoordinates" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surge_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SurchargeType" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "affectedAreas" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surge_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_pricing_overrides" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "baseFee" DOUBLE PRECISION,
    "perKmRate" DOUBLE PRECISION,
    "maxFee" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_pricing_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_history" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_profiles_country_idx" ON "pricing_profiles"("country");

-- CreateIndex
CREATE INDEX "pricing_profiles_state_idx" ON "pricing_profiles"("state");

-- CreateIndex
CREATE INDEX "pricing_profiles_city_idx" ON "pricing_profiles"("city");

-- CreateIndex
CREATE INDEX "pricing_profiles_status_idx" ON "pricing_profiles"("status");

-- CreateIndex
CREATE INDEX "pricing_profiles_effectiveFrom_idx" ON "pricing_profiles"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_profiles_country_state_city_key" ON "pricing_profiles"("country", "state", "city");

-- CreateIndex
CREATE INDEX "pricing_buckets_pricingProfileId_idx" ON "pricing_buckets"("pricingProfileId");

-- CreateIndex
CREATE INDEX "pricing_buckets_minDistanceKm_idx" ON "pricing_buckets"("minDistanceKm");

-- CreateIndex
CREATE INDEX "pricing_modifiers_pricingProfileId_idx" ON "pricing_modifiers"("pricingProfileId");

-- CreateIndex
CREATE INDEX "pricing_modifiers_surchargeType_idx" ON "pricing_modifiers"("surchargeType");

-- CreateIndex
CREATE INDEX "pricing_modifiers_isActive_idx" ON "pricing_modifiers"("isActive");

-- CreateIndex
CREATE INDEX "delivery_zones_pricingProfileId_idx" ON "delivery_zones"("pricingProfileId");

-- CreateIndex
CREATE INDEX "delivery_zones_type_idx" ON "delivery_zones"("type");

-- CreateIndex
CREATE INDEX "delivery_zones_isActive_idx" ON "delivery_zones"("isActive");

-- CreateIndex
CREATE INDEX "surge_events_type_idx" ON "surge_events"("type");

-- CreateIndex
CREATE INDEX "surge_events_startTime_idx" ON "surge_events"("startTime");

-- CreateIndex
CREATE INDEX "surge_events_endTime_idx" ON "surge_events"("endTime");

-- CreateIndex
CREATE INDEX "surge_events_isActive_idx" ON "surge_events"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_pricing_overrides_vendorId_key" ON "vendor_pricing_overrides"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_pricing_overrides_pricingProfileId_idx" ON "vendor_pricing_overrides"("pricingProfileId");

-- CreateIndex
CREATE INDEX "vendor_pricing_overrides_vendorId_idx" ON "vendor_pricing_overrides"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_pricing_overrides_isActive_idx" ON "vendor_pricing_overrides"("isActive");

-- CreateIndex
CREATE INDEX "pricing_history_pricingProfileId_idx" ON "pricing_history"("pricingProfileId");

-- CreateIndex
CREATE INDEX "pricing_history_createdAt_idx" ON "pricing_history"("createdAt");

-- AddForeignKey
ALTER TABLE "pricing_buckets" ADD CONSTRAINT "pricing_buckets_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_modifiers" ADD CONSTRAINT "pricing_modifiers_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_pricing_overrides" ADD CONSTRAINT "vendor_pricing_overrides_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_history" ADD CONSTRAINT "pricing_history_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "pricing_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
