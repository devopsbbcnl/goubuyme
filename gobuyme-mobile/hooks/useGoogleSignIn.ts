import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { router } from 'expo-router';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

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
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
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
    setError(null);
    void promptAsync();
  }, [promptAsync]);

  return {
    promptGoogleSignIn,
    googleBusy: busy,
    googleReady: !!request,
    googleError: error,
    clearGoogleError: () => setError(null),
  };
}
