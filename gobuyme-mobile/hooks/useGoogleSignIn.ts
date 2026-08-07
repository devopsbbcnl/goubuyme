import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/services/errorReporting';

// @react-native-google-signin/google-signin resolves its native TurboModule at import time,
// which throws in Expo Go (no native module registered there — it only works in a dev-client
// or standalone build). Guard the import so opening any screen that uses this hook doesn't
// crash the whole app when running in Expo Go.
const isExpoGo = Constants.appOwnership === 'expo';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleSigninModule = isExpoGo
  ? null
  : (require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin'));
const GoogleSignin = GoogleSigninModule?.GoogleSignin;
const statusCodes = GoogleSigninModule?.statusCodes;

// expo-auth-session's Google provider is deprecated (Expo SDK 49+) and its browser-redirect
// flow is now blocked by Google with "doesn't comply with Google's OAuth 2.0 policy for
// keeping apps secure" on native builds. GoogleSignin uses Google's native Credential
// Manager/Sign-In SDK instead, which is the flow Google still allows.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// Only webClientId is needed for Android — the native SDK resolves the calling app's own
// Android OAuth client from its package name + signing certificate automatically. The ID
// token returned always carries webClientId as its audience, which is what the backend verifies.
if (WEB_CLIENT_ID && GoogleSignin) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
  });
}

function getGoogleAuthErrorMessage(err: unknown): string {
  const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
  if (axiosErr.response?.status === 409) {
    return axiosErr.response.data?.message ?? 'This email is already registered with a different sign-in method.';
  }
  return axiosErr.response?.data?.message ?? 'Google sign-in failed. Please try again.';
}

export function useGoogleSignIn() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptGoogleSignIn = useCallback(() => {
    if (!WEB_CLIENT_ID || !GoogleSignin || !statusCodes) {
      setError(
        isExpoGo
          ? 'Google sign-in requires a development build — not available in Expo Go. Please use email sign-in for now.'
          : 'Google sign-in is not yet available on this device. Please use email sign-in for now.'
      );
      return;
    }

    (async () => {
      try {
        setBusy(true);
        setError(null);

        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const result = await GoogleSignin.signIn();
        if (result.type !== 'success') return; // user cancelled

        const idToken = result.data.idToken;
        if (!idToken) {
          setError('Google did not return a valid credential. Please try again.');
          return;
        }

        const res = await api.post('/auth/google', { idToken });
        const { user, accessToken, refreshToken } = res.data.data;

        await login({
          id: user.id, name: user.name, email: user.email, role: 'customer',
          token: accessToken,
          phone: user.phone ?? undefined,
          photoUrl: user.avatar ?? undefined,
        }, refreshToken);

        router.replace('/(customer)' as never);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === statusCodes!.SIGN_IN_CANCELLED) {
          // no-op — user backed out
        } else if (code === statusCodes!.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services is required for Google sign-in.');
          reportError(err, { source: 'google_signin', context: { code } });
        } else if (code === statusCodes!.IN_PROGRESS) {
          // a sign-in is already underway — ignore this duplicate tap
        } else {
          setError(getGoogleAuthErrorMessage(err));
          reportError(err, { source: 'google_signin', context: { code } });
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [login]);

  return {
    promptGoogleSignIn,
    googleBusy: busy,
    googleReady: !!WEB_CLIENT_ID && !!GoogleSignin,
    googleError: error,
    clearGoogleError: () => setError(null),
  };
}
