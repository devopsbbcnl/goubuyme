import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

/** Shown on vendors whose owner phone number has been confirmed by SMS OTP. */
export function PhoneVerifiedBadge() {
  const { theme: T } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: `${T.success}18` }]}>
      <Ionicons name="call" size={11} color={T.success} />
      <Text style={[styles.text, { color: T.success }]}>Phone Verified</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: { fontSize: 11, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
