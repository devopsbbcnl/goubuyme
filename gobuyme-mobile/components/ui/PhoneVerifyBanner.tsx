import React, { useCallback, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';

const COPY: Record<'vendor' | 'rider', string> = {
  vendor: 'Verify your phone number so customers and our team can reach you, and earn a Phone Verified badge.',
  rider: 'Verify your phone number so customers and our team can reach you during deliveries.',
};

/**
 * Soft prompt for vendors/riders whose phone isn't SMS-verified. Re-checks on every
 * focus, so it disappears as soon as the user comes back from /verify-phone.
 */
export function PhoneVerifyBanner({ role }: { role: 'vendor' | 'rider' }) {
  const { theme: T } = useTheme();
  const [unverified, setUnverified] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api.get('/auth/me')
        .then((res) => { if (active) setUnverified(res.data?.data?.isPhoneVerified === false); })
        .catch(() => {});
      return () => { active = false; };
    }, []),
  );

  if (!unverified) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push('/verify-phone' as never)}
      activeOpacity={0.8}
      style={[styles.container, { backgroundColor: T.warningBg, borderColor: T.warning }]}
    >
      <Ionicons name="phone-portrait-outline" size={18} color={T.warning} />
      <Text style={[styles.text, { color: T.text }]}>{COPY[role]}</Text>
      <Text style={[styles.cta, { color: T.primary }]}>Verify</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 16,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' },
  cta: { fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' },
});
