import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';

const ROLE_ROUTE = {
  customer: '/(customer)',
  vendor: '/(vendor)',
  rider: '/(rider)',
} as const;

type PendingOtp = { userId: string; email: string; role: string };

export default function Index() {
  const { user, role, loading } = useAuth();
  const [pendingOtp, setPendingOtp] = useState<PendingOtp | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem('pendingOtp')
      .then(val => setPendingOtp(val ? (JSON.parse(val) as PendingOtp) : null))
      .catch(() => setPendingOtp(null));
  }, []);

  if (loading || pendingOtp === undefined) return null;

  // Unauthenticated user returning mid-verification — send back to OTP screen
  if (!user && pendingOtp) {
    return (
      <Redirect
        href={`/verify-otp?userId=${pendingOtp.userId}&email=${encodeURIComponent(pendingOtp.email)}&role=${pendingOtp.role}` as never}
      />
    );
  }

  if (user && role && ROLE_ROUTE[role as keyof typeof ROLE_ROUTE]) {
    return <Redirect href={ROLE_ROUTE[role as keyof typeof ROLE_ROUTE]} />;
  }

  return <Redirect href="/splash" />;
}
