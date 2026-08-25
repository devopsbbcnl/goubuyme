import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ForgotPasswordScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setError('Enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Enter a valid email address.'); return; }

    try {
      setBusy(true);
      setError('');
      await api.post('/auth/forgot-password', { email: trimmedEmail.toLowerCase() });
      setSent(true);
    } catch {
      // Backend always returns success for this endpoint to avoid leaking account
      // existence, so a request failure here means a connectivity issue.
      setError('Cannot reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={T.text} />
        </TouchableOpacity>

        <View style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}>
          <Ionicons name={sent ? 'checkmark-circle-outline' : 'lock-closed-outline'} size={28} color={T.primary} />
        </View>

        {sent ? (
          <>
            <Text style={[styles.title, { color: T.text }]}>Check your email</Text>
            <Text style={[styles.sub, { color: T.textSec }]}>
              If an account exists for{' '}
              <Text style={{ color: T.text, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{email.trim()}</Text>
              , we've sent a link to reset your password. Open it on your phone or computer to
              choose a new password, then come back here to sign in.
            </Text>

            <TouchableOpacity
              onPress={() => router.replace('/login')}
              style={[styles.goToSignInBtn, { borderColor: T.border, backgroundColor: T.surface }]}
            >
              <Text style={{ fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: T.text }}>
                Go to Sign In
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: T.text }]}>Forgot password?</Text>
            <Text style={[styles.sub, { color: T.textSec }]}>
              Enter the email address linked to your account and we'll send you a link to reset your password.
            </Text>

            <AppInput
              label="Email Address"
              value={email}
              onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              error={error}
            />

            <View style={styles.btn}>
              <PrimaryButton onPress={handleSubmit} loading={busy}>Send Reset Link</PrimaryButton>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
  backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.5,
    fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 8,
  },
  sub: { fontSize: 14, lineHeight: 22, marginBottom: 28, fontFamily: 'PlusJakartaSans_400Regular' },
  btn: { marginTop: 12 },
  goToSignInBtn: {
    marginTop: 24, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
