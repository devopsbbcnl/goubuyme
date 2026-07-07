import api from '@/services/api';

export type VendorGateResult = '/vendor-complete-profile' | '/account-not-active' | '/vendor';

/**
 * Determines where a logged-in vendor should land: profile setup, the pending-approval
 * screen, or the dashboard. Mirrors the mobile app's post-login gating logic.
 */
export async function resolveVendorRoute(approvalStatus?: string): Promise<VendorGateResult> {
  try {
    const { data } = await api.get('/vendors/me');
    const v = data.data;
    const profileComplete = Boolean(v.description?.trim() && v.openingTime?.trim() && v.closingTime?.trim());
    if (!profileComplete) return '/vendor-complete-profile';
  } catch {
    // if the profile check fails, fall through to the approval check
  }
  if (approvalStatus !== 'APPROVED') return '/account-not-active';
  return '/vendor';
}
