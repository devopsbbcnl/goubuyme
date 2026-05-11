import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { radius, shadows } from '@/theme';

interface Props {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
}

export function PrimaryButton({ onPress, children, disabled, loading, variant = 'primary' }: Props) {
  const { theme: T } = useTheme();

  const bgColor = variant === 'primary' ? T.primary : 'transparent';
  const borderColor = variant === 'outline' ? T.primary : 'transparent';
  const textColor = variant === 'primary' ? '#fff' : T.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: disabled ? T.surface3 : bgColor, borderColor, borderWidth: variant === 'outline' ? 1.5 : 0 },
        variant === 'primary' && !disabled && shadows.primaryGlow(T.primary),
      ]}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={[styles.label, { color: disabled ? T.textMuted : textColor }]}>{children}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
