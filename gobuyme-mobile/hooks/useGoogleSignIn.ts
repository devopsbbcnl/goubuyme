import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// expo-auth-session throws at mount if the client ID for the current native
// platform is undefined, so fall back to the web client ID (won't actually
// authenticate, but keeps the screen from crashing) until Android/iOS OAuth
// client IDs are created in Google Cloud Console.
const nativeClientConfigured =
  Platform.OS === 'android' ? !!ANDROID_CLIENT_ID : Platform.OS === 'ios' ? !!IOS_CLIENT_ID : true;

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

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: ANDROID_CLIENT_ID ?? WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID ?? WEB_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;

    (async () => {
      try {
        setBusy(true);
        setError(null);
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
        setError(getGoogleAuthErrorMessage(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [response]);

  const promptGoogleSignIn = useCallback(() => {
    if (!nativeClientConfigured) {
      setError('Google sign-in is not yet available on this device. Please use email sign-in for now.');
      return;
    }
    setError(null);
    void promptAsync();
  }, [promptAsync]);

  return {
    promptGoogleSignIn,
    googleBusy: busy,
    googleReady: !!request && nativeClientConfigured,
    googleError: error,
    clearGoogleError: () => setError(null),
  };
}
