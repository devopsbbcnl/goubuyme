import prisma from '../config/db';

const SETTINGS_ID = 'default';

export const DEFAULT_PLATFORM_SETTINGS = {
  id: SETTINGS_ID,
  platformName: process.env.PLATFORM_NAME || 'GoBuyMe',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@gobuyme.shop',
  deliveryBaseFee: parseFloat(process.env.DELIVERY_BASE_FEE || '1500'),
  deliveryPerKmRate: parseFloat(process.env.DELIVERY_PER_KM_RATE || '100'),
  deliveryMaxFee: parseFloat(process.env.DELIVERY_MAX_FEE || '999999'),
  maxDeliveryRadiusKm: parseFloat(process.env.MAX_DELIVERY_RADIUS_KM || '25'),
  cancellationWindowMinutes: parseInt(process.env.CANCELLATION_WINDOW_MINUTES || '10', 10),
  customerCancellationWindowMinutes: parseInt(process.env.CUSTOMER_CANCELLATION_WINDOW_MINUTES || '2', 10),
  maintenanceMode: false,
  tier1CommissionPercent: parseFloat(process.env.COMMISSION_TIER_1_RATE || '0.03') * 100,
  tier2CommissionPercent: parseFloat(process.env.COMMISSION_TIER_2_RATE || '0.075') * 100,
  minAppVersion: '1.0.0',
  latestAppVersion: '1.0.0',
  storeUrlAndroid: 'https://play.google.com/store/apps/details?id=dev.bubblebarrel.gobuyme',
  storeUrlIos: '',
  appReleaseNotes: '',
  // International format, digits only (wa.me style), e.g. 2347078901075.
  supportWhatsapp: process.env.SUPPORT_WHATSAPP || '2347078901075',
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
  customerCancellationWindowMinutes: number;
  maintenanceMode: boolean;
  tier1CommissionPercent: number;
  tier2CommissionPercent: number;
  minAppVersion: string;
  latestAppVersion: string;
  storeUrlAndroid: string;
  storeUrlIos: string;
  appReleaseNotes: string;
  supportWhatsapp: string;
}>;

// Accepts what an admin might type ("0707 890 1075", "+234 707 890 1075") and
// returns digits in international format, or null if it can't be a Nigerian-style number.
export const normalizeWhatsappNumber = (raw: string): string | null => {
  let d = raw.replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0') && d.length === 11) d = `234${d.slice(1)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
};

export const updatePlatformSettings = async (data: PlatformSettingsPatch) =>
  prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    create: { ...DEFAULT_PLATFORM_SETTINGS, ...data },
    update: data,
  });
