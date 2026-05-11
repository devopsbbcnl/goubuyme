import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { radius, spacing } from '@/theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  error?: string;
}

export function AppInput({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType = 'default', error }: Props) {
  const { theme: T } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.label, { color: T.textSec }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={[styles.input, { backgroundColor: T.surface, borderColor: error ? '#E53E3E' : T.border, color: T.text }]}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, fontFamily: 'PlusJakartaSans_700Bold',
  },
  input: {
    borderWidth: 1.5, borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 15, fontFamily: 'PlusJakartaSans_400Regular',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 12,
    marginTop: 6,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
});
