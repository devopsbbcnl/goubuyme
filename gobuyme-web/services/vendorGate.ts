import api from '@/services/api';

export type VendorGateResult = '/vendor-complete-profile' | '/vendor';

/**
 * Determines where a logged-in vendor should land: profile setup or the dashboard.
 * Approval status no longer blocks dashboard access — it only restricts customer
 * visibility (enforced server-side) and is surfaced via a banner in the dashboard.
 */
export async function resolveVendorRoute(): Promise<VendorGateResult> {
  try {
    const { data } = await api.get('/vendors/me');
    const v = data.data;
    const profileComplete = Boolean(v.description?.trim() && v.openingTime?.trim() && v.closingTime?.trim());
    if (!profileComplete) return '/vendor-complete-profile';
  } catch {
    // if the profile check fails, fall through to the dashboard
  }
  return '/vendor';
}
