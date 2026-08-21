import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

const COPY: Record<'vendor' | 'rider', string> = {
  vendor: "Your account is pending verification. You won't appear in the store until approved.",
  rider: "Your account is pending verification. You can't receive delivery jobs until approved.",
};

export function ApprovalBanner({ role }: { role: 'vendor' | 'rider' }) {
  const { theme: T } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: T.warningBg, borderBottomColor: T.warning }]}>
      <Ionicons name="alert-circle-outline" size={16} color={T.warning} />
      <Text style={[styles.text, { color: T.text }]} numberOfLines={2}>
        {COPY[role]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
});
