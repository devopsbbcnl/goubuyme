import { Stack, router } from 'expo-router';
import { StatusBar } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { AddressProvider } from '@/context/AddressContext';
import { PaystackProvider } from 'react-native-paystack-webview';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { setOnUnauthorized } from '@/services/api';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  usePushNotifications();
  const { loading: authLoading, logout } = useAuth();

  useEffect(() => {
    // When api.ts exhausts the refresh token, clear auth state and send to login
    setOnUnauthorized(() => {
      logout();
      router.replace('/login');
    });
  }, [logout]);

  useEffect(() => {
    if (!authLoading) SplashScreen.hideAsync();
  }, [authLoading]);

  if (authLoading) return null;

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="role-select" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="register-success" />
      <Stack.Screen name="account-not-active" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(vendor)" />
      <Stack.Screen name="(rider)" />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <AddressProvider>
              <PaystackProvider publicKey={process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY as string}>
                <AppContent />
              </PaystackProvider>
            </AddressProvider>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
