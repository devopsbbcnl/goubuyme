import prisma from '../config/db';

const SETTINGS_ID = 'default';

export const DEFAULT_PLATFORM_SETTINGS = {
  id: SETTINGS_ID,
  platformName: process.env.PLATFORM_NAME || 'GoBuyMe',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@gobuyme.shop',
  deliveryBaseFee: parseFloat(process.env.DELIVERY_BASE_FEE || '500'),
  deliveryPerKmRate: parseFloat(process.env.DELIVERY_PER_KM_RATE || '100'),
  deliveryMaxFee: parseFloat(process.env.DELIVERY_MAX_FEE || '3000'),
  maxDeliveryRadiusKm: parseFloat(process.env.MAX_DELIVERY_RADIUS_KM || '25'),
  cancellationWindowMinutes: parseInt(process.env.CANCELLATION_WINDOW_MINUTES || '10', 10),
  maintenanceMode: false,
};

export const getPlatformSettings = async () =>
  prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: DEFAULT_PLATFORM_SETTINGS,
  });

export type PlatformSettingsPatch = Partial<{
  platformName: string;
  supportEmail: string;
  deliveryBaseFee: number;
  deliveryPerKmRate: number;
  deliveryMaxFee: number;
  maxDeliveryRadiusKm: number;
  cancellationWindowMinutes: number;
  maintenanceMode: boolean;
}>;

export const updatePlatformSettings = async (data: PlatformSettingsPatch) =>
  prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { ...DEFAULT_PLATFORM_SETTINGS, ...data },
    update: data,
  });
