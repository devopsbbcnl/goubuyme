import { router } from 'expo-router';
import type { UserRole } from '@/context/AuthContext';
import api from '@/services/api';

const ROLE_ROUTE: Record<string, string> = {
  customer: '/(customer)',
  vendor: '/(vendor)',
  rider: '/(rider)',
};

// Where a freshly signed-in user lands. Shared by password and Google sign-in so
// both route identically; a vendor with an unfinished profile goes to setup first.
export async function routeAfterLogin(role: UserRole): Promise<void> {
  if (role === 'vendor') {
    try {
      const vRes = await api.get('/vendors/me');
      const v = vRes.data.data;
      const profileComplete = !!(v.description?.trim() && v.openingTime?.trim() && v.closingTime?.trim());
      if (!profileComplete) {
        router.replace('/vendor-complete-profile' as never);
        return;
      }
    } catch {
      // if vendor profile check fails, fall through to dashboard
    }
  }
  router.replace((ROLE_ROUTE[role ?? ''] ?? '/(customer)') as never);
}
