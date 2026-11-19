import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from '@/services/api';
import { useAuth, UserRole } from '@/context/AuthContext';
import { routeAfterLogin } from '@/services/postLoginRoute';
import { reportError } from '@/services/errorReporting';

// expo-apple-authentication needs a native build (not Expo Go) and only exists on iOS. Guard the
// import the same way the Google hook does so opening a screen never crashes the app.
const isExpoGo = Constants.appOwnership === 'expo';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Apple =
  Platform.OS === 'ios' && !isExpoGo
    ? (require('expo-apple-authentication') as typeof import('expo-apple-authentication'))
    : null;

/** Ask Apple for a fresh credential. Null if the person cancelled. */
export async function requestAppleCredential() {
  if (!Apple) throw new Error('Sign in with Apple is not available on this device.');
  try {
    return await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: string } } };
  return e.response?.data?.message ?? 'Apple sign-in failed. Please try again.';
}

export function useAppleSignIn() {
  const { login } = useAuth();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Apple?.isAvailableAsync().then((ok) => { if (alive) setAvailable(ok); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const promptAppleSignIn = useCallback(async (referralCode?: string) => {
    try {
      setBusy(true);
      setError(null);

      const cred = await requestAppleCredential();
      if (!cred) return; // cancelled
      if (!cred.identityToken) {
        setError('Apple did not return a valid credential. Please try again.');
        return;
      }

      // Apple gives the name only the first time, and only to the app.
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      const res = await api.post('/auth/apple', {
        identityToken: cred.identityToken,
        authorizationCode: cred.authorizationCode ?? undefined,
        fullName: fullName || undefined,
        referralCode,
      });
      const { user, accessToken, refreshToken } = res.data.data;

      const role = (user.role as string).toLowerCase() as UserRole;
      await login({
        id: user.id, name: user.name, email: user.email, role,
        token: accessToken,
        approvalStatus: user.approvalStatus,
        phone: user.phone ?? undefined,
        photoUrl: user.avatar ?? undefined,
      }, refreshToken);

      await routeAfterLogin(role);
    } catch (err) {
      setError(errorMessage(err));
      reportError(err, { source: 'apple_signin' });
    } finally {
      setBusy(false);
    }
  }, [login]);

  return {
    promptAppleSignIn,
    appleBusy: busy,
    appleAvailable: available,
    appleError: error,
    clearAppleError: () => setError(null),
  };
}

export const AppleButtonModule = Apple;
