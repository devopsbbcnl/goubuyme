import prisma from '../config/db';
import { getDistance } from './distance.service';

export interface PricingCalculationInput {
  vendorLat: number;
  vendorLng: number;
  customerLat: number;
  customerLng: number;
  country?: string;
  state?: string;
  city?: string;
  vendorId?: string;
  orderTime?: Date;
  weatherCondition?: 'CLEAR' | 'RAIN' | 'HEAVY_RAIN';
  trafficLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PricingBreakdown {
  distanceKm: number;
  durationMinutes: number;
  matchedPricingProfile: {
    id: string;
    name: string;
    country: string;
    state: string | null;
    city: string | null;
  };
  pricingZone: {
    id: string;
    name: string;
    type: string;
    multiplier: number;
  } | null;
  baseFee: number;
  bucketFee: number;
  surcharges: Array<{
    name: string;
    type: string;
    value: number;
    amount: number;
  }>;
  areaMultiplier: number;
  surgeMultiplier: number;
  finalFee: number;
  estimatedRiderPayout: number;
}

/**
 * Find the appropriate pricing profile based on location hierarchy
 * Priority: City > State > Country > Default
 */
async function findPricingProfile(
  country: string,
  state?: string,
  city?: string,
): Promise<any> {
  const now = new Date();

  // Try city-specific first
  if (city && state) {
    const cityProfile = await prisma.pricingProfile.findFirst({
      where: {
        country,
        state,
        city,
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: now } },
        ],
      },
      orderBy: { priority: 'desc' },
    });
    if (cityProfile) return cityProfile;
  }

  // Try state-specific
  if (state) {
    const stateProfile = await prisma.pricingProfile.findFirst({
      where: {
        country,
        state,
        city: null,
        status: 'ACTIVE',
        effectiveFrom: { lte: now },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: now } },
        ],
      },
      orderBy: { priority: 'desc' },
    });
    if (stateProfile) return stateProfile;
  }

  // Try country-specific
  const countryProfile = await prisma.pricingProfile.findFirst({
    where: {
      country,
      state: null,
      city: null,
      status: 'ACTIVE',
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: now } },
      ],
    },
    orderBy: { priority: 'desc' },
  });
  if (countryProfile) return countryProfile;

  // Fall back to default
  return prisma.pricingProfile.findFirst({
    where: {
      isDefault: true,
      status: 'ACTIVE',
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: now } },
      ],
    },
  });
}

/**
 * Find the appropriate delivery zone based on customer location using PostGIS
 * Implements zone hierarchy: MICRO_ZONE > OPERATIONAL > CITY > STATE > COUNTRY
 */
async function findDeliveryZone(
  pricingProfileId: string,
  customerLat: number,
  customerLng: number,
): Promise<any> {
  // Try to find zone using PostGIS geometry first (most accurate)
  try {
    const zoneWithGeometry = await prisma.$queryRaw`
      SELECT * FROM delivery_zones 
      WHERE pricingProfileId = ${pricingProfileId}
        AND isActive = true
        AND geometry IS NOT NULL
        AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${customerLng}, ${customerLat}), 4326))
      ORDER BY 
        CASE zoneType
          WHEN 'MICRO_ZONE' THEN 1
          WHEN 'OPERATIONAL' THEN 2
          WHEN 'CITY' THEN 3
          WHEN 'STATE' THEN 4
          WHEN 'COUNTRY' THEN 5
          ELSE 6
        END
      LIMIT 1
    ` as any[];

    if (zoneWithGeometry && zoneWithGeometry.length > 0) {
      return zoneWithGeometry[0];
    }
  } catch (error) {
    console.error('PostGIS zone detection failed, falling back to simple logic:', error);
  }

  // Fallback: Try to find zone using landmark keywords (secondary signal)
  const zonesWithKeywords = await prisma.$queryRaw`
    SELECT * FROM delivery_zones 
    WHERE pricingProfileId = ${pricingProfileId}
      AND isActive = true
      AND landmarkKeywords IS NOT NULL
      AND array_length(landmarkKeywords, 1) > 0
    LIMIT 1
  ` as any[];

  if (zonesWithKeywords && zonesWithKeywords.length > 0) {
    return zonesWithKeywords[0];
  }

  // Final fallback: Return the first active zone (legacy behavior)
  return prisma.deliveryZone.findFirst({
    where: {
      pricingProfileId,
      isActive: true,
    },
  });
}

/**
 * Calculate fee based on distance buckets
 */
function calculateBucketFee(
  distanceKm: number,
  buckets: any[],
): { fee: number; bucket: any } {
  // Sort buckets by minDistanceKm
  const sortedBuckets = buckets.sort((a, b) => a.minDistanceKm - b.minDistanceKm);

  for (const bucket of sortedBuckets) {
    // Check if distance falls within this bucket
    if (distanceKm >= bucket.minDistanceKm) {
      if (bucket.maxDistanceKm === null || distanceKm < bucket.maxDistanceKm) {
        return { fee: bucket.fee, bucket };
      }
      // If this is the last bucket (no max), use perKmRate for extra distance
      if (bucket.maxDistanceKm === null && bucket.perKmRate) {
        const extraKm = distanceKm - bucket.minDistanceKm;
        const extraFee = extraKm * bucket.perKmRate;
        return { fee: bucket.fee + extraFee, bucket };
      }
    }
  }

  // Default to first bucket if no match
  return { fee: sortedBuckets[0]?.fee || 0, bucket: sortedBuckets[0] };
}

/**
 * Calculate applicable surcharges based on conditions
 */
function calculateSurcharges(
  modifiers: any[],
  orderTime: Date,
  weatherCondition?: string,
  trafficLevel?: string,
): Array<{ name: string; type: string; value: number; amount: number }> {
  const surcharges: Array<{ name: string; type: string; value: number; amount: number }> = [];
  const hour = orderTime.getHours();

  for (const modifier of modifiers) {
    if (!modifier.isActive) continue;

    let shouldApply = false;
    let baseAmount = 0;

    switch (modifier.surchargeType) {
      case 'NIGHT_DELIVERY':
        // Night delivery: 9PM - 6AM
        if (hour >= 21 || hour < 6) {
          shouldApply = true;
          baseAmount = modifier.value; // Fixed amount
        }
        break;

      case 'RAIN':
        if (weatherCondition === 'RAIN' || weatherCondition === 'HEAVY_RAIN') {
          shouldApply = true;
          baseAmount = modifier.value; // Percentage
        }
        break;

      case 'HIGH_TRAFFIC':
        if (trafficLevel === 'HIGH') {
          shouldApply = true;
          baseAmount = modifier.value; // Percentage
        }
        break;

      case 'FUEL':
        // Fuel surcharge always applies if active
        shouldApply = true;
        baseAmount = modifier.value; // Fixed amount
        break;

      case 'EMERGENCY':
        // Emergency surcharge always applies if active
        shouldApply = true;
        baseAmount = modifier.value; // Percentage
        break;
    }

    if (shouldApply) {
      surcharges.push({
        name: modifier.name,
        type: modifier.type,
        value: modifier.value,
        amount: baseAmount,
      });
    }
  }

  return surcharges;
}

/**
 * Check for active surge events
 */
async function getSurgeMultiplier(
  country: string,
  state: string | undefined,
  city: string | undefined,
  orderTime?: Date,
): Promise<number> {
  const now = orderTime || new Date();

  const activeSurges = await prisma.surgeEvent.findMany({
    where: {
      isActive: true,
      startTime: { lte: now },
      endTime: { gte: now },
    },
  });

  if (activeSurges.length === 0) return 1.0;

  // Find the highest applicable surge multiplier
  let maxMultiplier = 1.0;
  for (const surge of activeSurges) {
    // Check if surge applies to this location
    const affectedAreas = surge.affectedAreas as any;
    if (!affectedAreas) {
      // Surge applies everywhere
      maxMultiplier = Math.max(maxMultiplier, surge.multiplier);
    } else {
      // Check if location matches affected areas
      const matchesCountry = affectedAreas.country === country;
      const matchesState = !affectedAreas.state || affectedAreas.state === state;
      const matchesCity = !affectedAreas.city || affectedAreas.city === city;

      if (matchesCountry && matchesState && matchesCity) {
        maxMultiplier = Math.max(maxMultiplier, surge.multiplier);
      }
    }
  }

  return maxMultiplier;
}

/**
 * Check for vendor-specific pricing override
 */
async function getVendorOverride(
  vendorId: string | undefined,
  pricingProfileId: string,
): Promise<{ baseFee?: number; perKmRate?: number; maxFee?: number } | null> {
  if (!vendorId) return null;

  const override = await prisma.vendorPricingOverride.findUnique({
    where: { vendorId },
  });

  if (!override || !override.isActive || override.pricingProfileId !== pricingProfileId) {
    return null;
  }

  return {
    baseFee: override.baseFee ?? undefined,
    perKmRate: override.perKmRate ?? undefined,
    maxFee: override.maxFee ?? undefined,
  };
}

/**
 * Main pricing calculation function
 */
export async function calculateDeliveryFee(
  input: PricingCalculationInput,
): Promise<PricingBreakdown> {
  const {
    vendorLat,
    vendorLng,
    customerLat,
    customerLng,
    country = 'Nigeria',
    state,
    city,
    vendorId,
    orderTime = new Date(),
    weatherCondition,
    trafficLevel,
  } = input;

  // 1. Calculate distance using Google Maps Routes API
  const { distanceKm, durationMinutes } = await getDistance(
    vendorLat,
    vendorLng,
    customerLat,
    customerLng,
  );

  // 2. Find appropriate pricing profile
  const pricingProfile = await findPricingProfile(country, state, city);
  if (!pricingProfile) {
    throw new Error('No active pricing profile found');
  }

  // 3. Check for vendor-specific override
  const vendorOverride = await getVendorOverride(vendorId, pricingProfile.id);

  // 4. Find delivery zone
  const deliveryZone = await findDeliveryZone(pricingProfile.id, customerLat, customerLng);

  // 5. Get pricing buckets
  const buckets = await prisma.pricingBucket.findMany({
    where: { pricingProfileId: pricingProfile.id },
    orderBy: { minDistanceKm: 'asc' },
  });

  // 6. Calculate bucket fee
  const { fee: bucketFee, bucket } = calculateBucketFee(distanceKm, buckets);

  // 7. Get pricing modifiers
  const modifiers = await prisma.pricingModifier.findMany({
    where: { pricingProfileId: pricingProfile.id, isActive: true },
  });

  // 8. Calculate surcharges
  const surcharges = calculateSurcharges(modifiers, orderTime, weatherCondition, trafficLevel);

  // 9. Calculate base fee (use override if available)
  let baseFee = vendorOverride?.baseFee ?? pricingProfile.baseFee;
  if (baseFee < pricingProfile.minimumFee) {
    baseFee = pricingProfile.minimumFee;
  }

  // 10. Calculate area multiplier
  const areaMultiplier = deliveryZone?.multiplier || 1.0;

  // 11. Get surge multiplier
  const surgeMultiplier = await getSurgeMultiplier(country, state || undefined, city || undefined, orderTime);

  // 12. Calculate final fee
  let finalFee = baseFee;

  // Add bucket fee
  finalFee += bucketFee;

  // Apply surcharges
  let surchargeTotal = 0;
  for (const surcharge of surcharges) {
    if (surcharge.type === 'PERCENTAGE') {
      surchargeTotal += (finalFee * surcharge.value) / 100;
    } else {
      surchargeTotal += surcharge.amount;
    }
  }
  finalFee += surchargeTotal;

  // Apply area multiplier
  finalFee *= areaMultiplier;

  // Apply surge multiplier
  finalFee *= surgeMultiplier;

  // Apply maximum fee cap
  const maxFee = vendorOverride?.maxFee ?? pricingProfile.maximumFee;
  if (maxFee && finalFee > maxFee) {
    finalFee = maxFee;
  }

  // Round to nearest naira
  finalFee = Math.ceil(finalFee);

  // 13. Estimate rider payout (use profile-specific or platform default)
  const platformSettings = await prisma.$queryRaw`
    SELECT * FROM platform_settings WHERE id = 'default'
  ` as any[];
  const riderPayoutPercentage = pricingProfile.riderPayoutPercentage ?? platformSettings[0]?.riderPayoutPercentage ?? 85;
  const estimatedRiderPayout = Math.ceil(finalFee * (riderPayoutPercentage / 100));

  return {
    distanceKm,
    durationMinutes,
    matchedPricingProfile: {
      id: pricingProfile.id,
      name: pricingProfile.name,
      country: pricingProfile.country,
      state: pricingProfile.state,
      city: pricingProfile.city,
    },
    pricingZone: deliveryZone ? {
      id: deliveryZone.id,
      name: deliveryZone.name,
      type: deliveryZone.type,
      multiplier: deliveryZone.multiplier,
    } : null,
    baseFee,
    bucketFee,
    surcharges: surcharges.map(s => ({
      ...s,
      amount: s.type === 'PERCENTAGE' ? (finalFee * s.value) / 100 : s.amount,
    })),
    areaMultiplier,
    surgeMultiplier,
    finalFee,
    estimatedRiderPayout,
  };
}
