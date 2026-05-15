import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAuth, UserRole } from '@/context/AuthContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROLE_ROUTE: Record<string, string> = {
  customer: '/(customer)',
  vendor: '/(vendor)',
  rider: '/(rider)',
};

type LoginErrors = {
  email?: string;
  password?: string;
  general?: string;
};

function getLoginErrorMessage(err: unknown): LoginErrors {
  const axiosErr = err as {
    response?: {
      status?: number;
      data?: { message?: string; errors?: { field: string; message: string }[] };
    };
    request?: unknown;
  };
  const status = axiosErr.response?.status;
  const message = axiosErr.response?.data?.message;
  const fieldError = axiosErr.response?.data?.errors?.[0];

  if (fieldError?.field === 'email') return { email: 'Enter a valid email address.' };
  if (fieldError?.field === 'password') return { password: 'Enter your password.' };
  if (status === 404) return { email: 'No account found with this email address.' };
  if (status === 401) return { password: 'Incorrect password. Please try again.' };
  if (status === 403) return { general: message ?? 'Account access denied. Contact support.' };
  if (status === 429) return { general: 'Too many login attempts. Please wait a moment and try again.' };
  if (axiosErr.request && !axiosErr.response) {
    return { general: 'Cannot reach the server. Check your connection and try again.' };
  }

  return { general: message ?? 'Login failed. Please try again.' };
}

export default function LoginScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const validateLogin = () => {
    const next: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async () => {
    if (!validateLogin()) return;

    try {
      setBusy(true);
      setErrors({});
      const res = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      const { user, accessToken, refreshToken } = res.data.data;
      const role = (user.role as string).toLowerCase() as UserRole;

      await login({
        id: user.id, name: user.name, email: user.email, role, token: accessToken,
        approvalStatus: user.approvalStatus,
        phone: user.phone ?? undefined,
        photoUrl: user.avatar ?? undefined,
      }, refreshToken);

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
          // if vendor profile check fails, fall through to approval status check
        }
        if (user.approvalStatus !== 'APPROVED') {
          router.replace({ pathname: '/account-not-active', params: { role } } as never);
          return;
        }
        router.replace('/(vendor)' as never);
        return;
      }

      if (role === 'rider' && user.approvalStatus !== 'APPROVED') {
        router.replace({ pathname: '/account-not-active', params: { role } } as never);
        return;
      }

      const route = ROLE_ROUTE[role ?? ''] ?? '/(customer)';
      router.replace(route as never);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { errors?: { requiresVerification?: boolean; userId?: string; email?: string; role?: string }[] } } };
      const verificationPayload = axiosErr.response?.data?.errors?.[0];
      if (axiosErr.response?.status === 403 && verificationPayload?.requiresVerification) {
        await AsyncStorage.setItem('pendingOtp', JSON.stringify({
          userId: verificationPayload.userId,
          email: verificationPayload.email,
          role: verificationPayload.role,
        }));
        router.replace({
          pathname: '/verify-otp',
          params: {
            userId: verificationPayload.userId,
            email: verificationPayload.email,
            role: verificationPayload.role,
          },
        } as never);
        return;
      }
      setErrors(getLoginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: T.text }]}>Welcome back</Text>
      <Text style={[styles.sub, { color: T.textSec }]}>Sign in to continue</Text>

      <View style={styles.form}>
        <AppInput
          label="Email Address"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (errors.email || errors.general) setErrors(prev => ({ ...prev, email: undefined, general: undefined }));
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          error={errors.email}
        />
        <AppInput
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password || errors.general) setErrors(prev => ({ ...prev, password: undefined, general: undefined }));
          }}
          placeholder="Enter your password"
          secureTextEntry
          error={errors.password}
        />

        {!!errors.general && (
          <Text style={[styles.errorText, { color: '#E53E3E' }]}>{errors.general}</Text>
        )}

        <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: T.primary, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
            Forgot password?
          </Text>
        </TouchableOpacity>

        <PrimaryButton onPress={handleLogin} loading={busy}>Sign In</PrimaryButton>

        <View style={styles.divider}>
          <View style={[styles.line, { backgroundColor: T.border }]} />
          <Text style={[styles.orText, { color: T.textMuted }]}>or</Text>
          <View style={[styles.line, { backgroundColor: T.border }]} />
        </View>

        <TouchableOpacity style={[styles.googleBtn, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={{ fontSize: 18 }}>G</Text>
          <Text style={[styles.googleText, { color: T.text }]}>Continue with Google</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={{ fontSize: 14, color: T.textSec }}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/role-select')}>
          <Text style={{ fontSize: 14, color: T.primary, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' }}>
            Sign Up
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 16, flexGrow: 1 },
  heading: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' },
  sub: { fontSize: 14, marginTop: 6, marginBottom: 32, fontFamily: 'PlusJakartaSans_400Regular' },
  form: { gap: 0 },
  errorText: { fontSize: 13, marginBottom: 12, fontFamily: 'PlusJakartaSans_400Regular' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1 },
  orText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderWidth: 1, borderRadius: 4,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  googleText: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: 24 },
});
