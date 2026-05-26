import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { calculateDeliveryFee } from '../services/pricing.service';

// ─── Pricing Profiles ─────────────────────────────────────────────────────

export const getPricingProfiles = catchAsync(async (req: AuthRequest, res: Response) => {
  const profiles = await prisma.pricingProfile.findMany({
    include: {
      buckets: true,
      modifiers: true,
      // zones: true, // Temporarily disabled due to PostGIS field issues
      _count: true,
    },
    orderBy: { priority: 'desc' },
  });

  return apiResponse.success(res, 'Pricing profiles fetched.', profiles);
});

export const getPricingProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const profile = await prisma.pricingProfile.findUnique({
    where: { id },
    include: {
      buckets: { orderBy: { minDistanceKm: 'asc' } },
      modifiers: { where: { isActive: true } },
      zones: { where: { isActive: true } },
      vendorOverrides: true,
      history: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!profile) {
    return apiResponse.error(res, 'Pricing profile not found.', 404);
  }

  return apiResponse.success(res, 'Pricing profile fetched.', profile);
});

export const createPricingProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name,
    country,
    state,
    city,
    baseFee,
    minimumFee,
    maximumFee,
    maxDeliveryRadiusKm,
    freeDeliveryThreshold,
    riderPayoutPercentage,
    isDefault,
    priority,
    effectiveFrom,
    effectiveTo,
  } = req.body;

  // If setting as default, remove default flag from other profiles
  if (isDefault) {
    await prisma.pricingProfile.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const profile = await prisma.pricingProfile.create({
    data: {
      name,
      country,
      state,
      city,
      baseFee,
      minimumFee,
      maximumFee,
      maxDeliveryRadiusKm,
      freeDeliveryThreshold,
      riderPayoutPercentage,
      isDefault,
      priority,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    },
  });

  // Log the change
  await prisma.pricingHistory.create({
    data: {
      pricingProfileId: profile.id,
      changedBy: req.user!.userId,
      changeType: 'CREATE',
      newValue: profile as any,
      reason: 'Created new pricing profile',
    },
  });

  return apiResponse.success(res, 'Pricing profile created.', profile, 201);
});

export const updatePricingProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    status,
    baseFee,
    minimumFee,
    maximumFee,
    maxDeliveryRadiusKm,
    freeDeliveryThreshold,
    riderPayoutPercentage,
    isDefault,
    priority,
    effectiveFrom,
    effectiveTo,
  } = req.body;

  const existing = await prisma.pricingProfile.findUnique({ where: { id } });
  if (!existing) {
    return apiResponse.error(res, 'Pricing profile not found.', 404);
  }

  // If setting as default, remove default flag from other profiles
  if (isDefault && !existing.isDefault) {
    await prisma.pricingProfile.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.pricingProfile.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(status !== undefined && { status }),
      ...(baseFee !== undefined && { baseFee }),
      ...(minimumFee !== undefined && { minimumFee }),
      ...(maximumFee !== undefined && { maximumFee }),
      ...(maxDeliveryRadiusKm !== undefined && { maxDeliveryRadiusKm }),
      ...(freeDeliveryThreshold !== undefined && { freeDeliveryThreshold }),
      ...(riderPayoutPercentage !== undefined && { riderPayoutPercentage }),
      ...(isDefault !== undefined && { isDefault }),
      ...(priority !== undefined && { priority }),
      ...(effectiveFrom !== undefined && { effectiveFrom: new Date(effectiveFrom) }),
      ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
    },
  });

  // Log the change
  await prisma.pricingHistory.create({
    data: {
      pricingProfileId: id,
      changedBy: req.user!.userId,
      changeType: 'UPDATE',
      oldValue: existing as any,
      newValue: updated as any,
      reason: 'Updated pricing profile',
    },
  });

  return apiResponse.success(res, 'Pricing profile updated.', updated);
});

export const deletePricingProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.pricingProfile.findUnique({ where: { id } });
  if (!existing) {
    return apiResponse.error(res, 'Pricing profile not found.', 404);
  }

  if (existing.isDefault) {
    return apiResponse.error(res, 'Cannot delete default pricing profile.', 400);
  }

  await prisma.pricingProfile.delete({ where: { id } });

  // Log the change
  await prisma.pricingHistory.create({
    data: {
      pricingProfileId: id,
      changedBy: req.user!.userId,
      changeType: 'DELETE',
      oldValue: existing as any,
      reason: 'Deleted pricing profile',
    },
  });

  return apiResponse.success(res, 'Pricing profile deleted.');
});

// ─── Pricing Buckets ─────────────────────────────────────────────────────

export const createPricingBucket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { pricingProfileId, minDistanceKm, maxDistanceKm, fee, perKmRate, description } = req.body;

  const bucket = await prisma.pricingBucket.create({
    data: {
      pricingProfileId,
      minDistanceKm,
      maxDistanceKm,
      fee,
      perKmRate,
      description,
    },
  });

  return apiResponse.success(res, 'Pricing bucket created.', bucket, 201);
});

export const updatePricingBucket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { minDistanceKm, maxDistanceKm, fee, perKmRate, description } = req.body;

  const updated = await prisma.pricingBucket.update({
    where: { id },
    data: {
      ...(minDistanceKm !== undefined && { minDistanceKm }),
      ...(maxDistanceKm !== undefined && { maxDistanceKm }),
      ...(fee !== undefined && { fee }),
      ...(perKmRate !== undefined && { perKmRate }),
      ...(description !== undefined && { description }),
    },
  });

  return apiResponse.success(res, 'Pricing bucket updated.', updated);
});

export const deletePricingBucket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.pricingBucket.delete({ where: { id } });

  return apiResponse.success(res, 'Pricing bucket deleted.');
});

// ─── Pricing Modifiers ────────────────────────────────────────────────────

export const createPricingModifier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { pricingProfileId, type, surchargeType, name, value, conditions, isActive } = req.body;

  const modifier = await prisma.pricingModifier.create({
    data: {
      pricingProfileId,
      type,
      surchargeType,
      name,
      value,
      conditions,
      isActive: isActive ?? true,
    },
  });

  return apiResponse.success(res, 'Pricing modifier created.', modifier, 201);
});

export const updatePricingModifier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { type, surchargeType, name, value, conditions, isActive } = req.body;

  const updated = await prisma.pricingModifier.update({
    where: { id },
    data: {
      ...(type !== undefined && { type }),
      ...(surchargeType !== undefined && { surchargeType }),
      ...(name !== undefined && { name }),
      ...(value !== undefined && { value }),
      ...(conditions !== undefined && { conditions }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return apiResponse.success(res, 'Pricing modifier updated.', updated);
});

export const deletePricingModifier = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.pricingModifier.delete({ where: { id } });

  return apiResponse.success(res, 'Pricing modifier deleted.');
});

// ─── Delivery Zones ───────────────────────────────────────────────────────

export const getDeliveryZones = catchAsync(async (req: AuthRequest, res: Response) => {
  const { pricingProfileId } = req.query;

  // Use raw SQL to exclude PostGIS geometry field which causes Prisma issues
  let query = `
    SELECT 
      id, 
      "pricingProfileId", 
      name, 
      type, 
      multiplier, 
      description, 
      "isActive", 
      "createdAt", 
      "updatedAt"
    FROM delivery_zones 
  `;
  
  const params: any[] = [];
  if (pricingProfileId) {
    query += ` WHERE "pricingProfileId" = $1`;
    params.push(pricingProfileId);
  }
  
  query += ` ORDER BY name ASC`;
  
  const zones = await prisma.$queryRawUnsafe(query, ...params);

  return apiResponse.success(res, 'Delivery zones fetched.', zones);
});

export const createDeliveryZone = catchAsync(async (req: AuthRequest, res: Response) => {
  const { 
    pricingProfileId, 
    name, 
    type, 
    zoneType,
    parentZoneId,
    multiplier, 
    description, 
    polygonCoordinates, 
    geometry,
    landmarkKeywords,
    requiresManualCorrection,
    isActive 
  } = req.body;

  // Create zone using Prisma with basic fields only
  const zone = await prisma.deliveryZone.create({
    data: {
      pricingProfileId,
      name,
      type,
      multiplier,
      description,
      polygonCoordinates,
      isActive: isActive ?? true,
    },
  });

  // Update new fields using raw SQL if they exist in the database
  try {
    if (zoneType !== undefined || parentZoneId !== undefined || landmarkKeywords !== undefined || requiresManualCorrection !== undefined) {
      await prisma.$executeRawUnsafe(
        `UPDATE delivery_zones 
        SET 
          "zoneType" = COALESCE($1, "zoneType"),
          "parentZoneId" = COALESCE($2, "parentZoneId"),
          "landmarkKeywords" = COALESCE($3, "landmarkKeywords"),
          "requiresManualCorrection" = COALESCE($4, "requiresManualCorrection")
        WHERE id = $5`,
        zoneType || null,
        parentZoneId || null,
        landmarkKeywords || null,
        requiresManualCorrection !== undefined ? requiresManualCorrection : null,
        zone.id
      );
    }
  } catch (error) {
    // Ignore errors if new columns don't exist yet
    console.log('New zone fields may not exist yet, skipping update');
  }

  // If geometry is provided, update it using raw SQL
  if (geometry) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE delivery_zones SET geometry = ST_GeomFromGeoJSON($1) WHERE id = $2`,
        JSON.stringify(geometry),
        zone.id
      );
    } catch (error) {
      console.log('Geometry column may not exist yet, skipping update');
    }
  }

  return apiResponse.success(res, 'Delivery zone created.', zone, 201);
});

export const updateDeliveryZone = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { 
    name, 
    type, 
    zoneType,
    parentZoneId,
    multiplier, 
    description, 
    polygonCoordinates, 
    geometry,
    landmarkKeywords,
    requiresManualCorrection,
    isActive 
  } = req.body;

  // Update basic fields using Prisma
  const updated = await prisma.deliveryZone.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(multiplier !== undefined && { multiplier }),
      ...(description !== undefined && { description }),
      ...(polygonCoordinates !== undefined && { polygonCoordinates }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  // Update new fields using raw SQL to avoid Prisma type issues
  if (zoneType !== undefined || parentZoneId !== undefined || landmarkKeywords !== undefined || requiresManualCorrection !== undefined) {
    await prisma.$executeRawUnsafe(
      `UPDATE delivery_zones 
      SET 
        "zoneType" = COALESCE($1, "zoneType"),
        "parentZoneId" = COALESCE($2, "parentZoneId"),
        "landmarkKeywords" = COALESCE($3, "landmarkKeywords"),
        "requiresManualCorrection" = COALESCE($4, "requiresManualCorrection")
      WHERE id = $5`,
      zoneType || null,
      parentZoneId || null,
      landmarkKeywords || null,
      requiresManualCorrection !== undefined ? requiresManualCorrection : null,
      id
    );
  }

  // Update geometry if provided
  if (geometry !== undefined) {
    if (geometry === null) {
      await prisma.$executeRawUnsafe(
        `UPDATE delivery_zones SET geometry = NULL WHERE id = $1`,
        id
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE delivery_zones SET geometry = ST_GeomFromGeoJSON($1) WHERE id = $2`,
        JSON.stringify(geometry),
        id
      );
    }
  }

  return apiResponse.success(res, 'Delivery zone updated.', updated);
});

export const deleteDeliveryZone = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.deliveryZone.delete({ where: { id } });

  return apiResponse.success(res, 'Delivery zone deleted.');
});

// ─── Surge Events ─────────────────────────────────────────────────────────

export const getSurgeEvents = catchAsync(async (req: AuthRequest, res: Response) => {
  const { isActive } = req.query;

  const events = await prisma.surgeEvent.findMany({
    where: isActive !== undefined ? { isActive: isActive === 'true' } : undefined,
    orderBy: { startTime: 'desc' },
  });

  return apiResponse.success(res, 'Surge events fetched.', events);
});

export const createSurgeEvent = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, type, multiplier, startTime, endTime, affectedAreas, isActive } = req.body;

  const event = await prisma.surgeEvent.create({
    data: {
      name,
      type,
      multiplier,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      affectedAreas,
      isActive: isActive ?? true,
    },
  });

  return apiResponse.success(res, 'Surge event created.', event, 201);
});

export const updateSurgeEvent = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, type, multiplier, startTime, endTime, affectedAreas, isActive } = req.body;

  const updated = await prisma.surgeEvent.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(multiplier !== undefined && { multiplier }),
      ...(startTime !== undefined && { startTime: new Date(startTime) }),
      ...(endTime !== undefined && { endTime: new Date(endTime) }),
      ...(affectedAreas !== undefined && { affectedAreas }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return apiResponse.success(res, 'Surge event updated.', updated);
});

export const deleteSurgeEvent = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.surgeEvent.delete({ where: { id } });

  return apiResponse.success(res, 'Surge event deleted.');
});

// ─── Pricing Simulation ───────────────────────────────────────────────────

export const simulatePricing = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    vendorLat,
    vendorLng,
    customerLat,
    customerLng,
    country,
    state,
    city,
    vendorId,
    orderTime,
    weatherCondition,
    trafficLevel,
  } = req.body;

  const result = await calculateDeliveryFee({
    vendorLat,
    vendorLng,
    customerLat,
    customerLng,
    country,
    state,
    city,
    vendorId,
    orderTime: orderTime ? new Date(orderTime) : undefined,
    weatherCondition,
    trafficLevel,
  });

  return apiResponse.success(res, 'Pricing simulation completed.', result);
});
