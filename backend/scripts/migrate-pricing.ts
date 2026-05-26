import prisma from '../src/config/db';

async function migratePricing() {
  console.log('[Migration] Starting pricing data migration...');

  try {
    // 1. Get existing platform settings
    const platformSettings = await prisma.platformSetting.findUnique({
      where: { id: 'default' },
    });

    if (!platformSettings) {
      console.error('[Migration] Platform settings not found');
      return;
    }

    console.log('[Migration] Found platform settings:', {
      baseFee: platformSettings.deliveryBaseFee,
      perKmRate: platformSettings.deliveryPerKmRate,
      maxFee: platformSettings.deliveryMaxFee,
      maxRadius: platformSettings.maxDeliveryRadiusKm,
    });

    // 2. Check if default pricing profile already exists
    const existingProfile = await prisma.pricingProfile.findFirst({
      where: { country: 'Nigeria', state: null, city: null },
    });

    if (existingProfile) {
      console.log('[Migration] Default pricing profile already exists, skipping migration');
      return;
    }

    // 3. Create default pricing profile for Nigeria
    const pricingProfile = await prisma.pricingProfile.create({
      data: {
        name: 'Default Nigeria Pricing',
        country: 'Nigeria',
        state: null,
        city: null,
        status: 'ACTIVE',
        baseFee: 700, // Default base fee from requirements
        minimumFee: 700,
        maximumFee: platformSettings.deliveryMaxFee || 999999,
        maxDeliveryRadiusKm: platformSettings.maxDeliveryRadiusKm || 25,
        freeDeliveryThreshold: null,
        isDefault: true,
        priority: 0,
        effectiveFrom: new Date(),
      },
    });

    console.log('[Migration] Created default pricing profile:', pricingProfile.id);

    // 4. Create default distance buckets (Nigerian distance bucket model)
    const buckets = [
      { minDistanceKm: 0, maxDistanceKm: 2, fee: 700, description: '0-2km' },
      { minDistanceKm: 2, maxDistanceKm: 5, fee: 1200, description: '2-5km' },
      { minDistanceKm: 5, maxDistanceKm: 8, fee: 1800, description: '5-8km' },
      { minDistanceKm: 8, maxDistanceKm: 12, fee: 2500, description: '8-12km' },
      { minDistanceKm: 12, maxDistanceKm: null, fee: 2500, perKmRate: 250, description: 'Above 12km' },
    ];

    for (const bucket of buckets) {
      await prisma.pricingBucket.create({
        data: {
          pricingProfileId: pricingProfile.id,
          minDistanceKm: bucket.minDistanceKm,
          maxDistanceKm: bucket.maxDistanceKm,
          fee: bucket.fee,
          perKmRate: bucket.perKmRate,
          description: bucket.description,
        },
      });
    }

    console.log('[Migration] Created default distance buckets');

    // 5. Create default pricing modifiers
    const modifiers = [
      {
        type: 'PERCENTAGE',
        surchargeType: 'NIGHT_DELIVERY',
        name: 'Night Delivery Surcharge',
        value: 300,
        conditions: { startTime: '21:00', endTime: '06:00' },
      },
      {
        type: 'PERCENTAGE',
        surchargeType: 'RAIN',
        name: 'Rain Surcharge',
        value: 20,
        conditions: {},
      },
      {
        type: 'PERCENTAGE',
        surchargeType: 'HIGH_TRAFFIC',
        name: 'High Traffic Surcharge',
        value: 15,
        conditions: {},
      },
      {
        type: 'FIXED',
        surchargeType: 'FUEL',
        name: 'Fuel Surcharge',
        value: 100,
        conditions: {},
      },
    ];

    for (const modifier of modifiers) {
      await prisma.pricingModifier.create({
        data: {
          pricingProfileId: pricingProfile.id,
          type: modifier.type as any,
          surchargeType: modifier.surchargeType as any,
          name: modifier.name,
          value: modifier.value,
          conditions: modifier.conditions as any,
          isActive: true,
        },
      });
    }

    console.log('[Migration] Created default pricing modifiers');

    // 6. Create default delivery zone
    await prisma.deliveryZone.create({
      data: {
        pricingProfileId: pricingProfile.id,
        name: 'Normal Zone',
        type: 'NORMAL',
        multiplier: 1.0,
        description: 'Standard delivery area',
        isActive: true,
      },
    });

    console.log('[Migration] Created default delivery zone');

    console.log('[Migration] Pricing data migration completed successfully');
  } catch (error) {
    console.error('[Migration] Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if executed directly
if (require.main === module) {
  migratePricing()
    .then(() => {
      console.log('[Migration] Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migration] Migration failed:', error);
      process.exit(1);
    });
}

export default migratePricing;
