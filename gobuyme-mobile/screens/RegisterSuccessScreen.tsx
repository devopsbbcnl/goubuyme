import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

type RoleParam = 'customer' | 'vendor' | 'rider';

const SUCCESS_MESSAGES: Record<RoleParam, { heading: string; body: string }> = {
  customer: {
    heading: 'You\'re all set!',
    body: 'Registration successful. GoBuyMe is ready to serve you.',
  },
  vendor: {
    heading: 'Welcome aboard!',
    body: 'You have registered successfully. Your account is currently being set up. Please check your email for further instructions.',
  },
  rider: {
    heading: 'Let\'s ride!',
    body: 'You have registered successfully. Zoom into your daily hustle.',
  },
};

export default function RegisterSuccessScreen() {
  const { theme: T } = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = ((params.role ?? 'customer') as RoleParam);
  const content = SUCCESS_MESSAGES[role] ?? SUCCESS_MESSAGES.customer;

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <View style={styles.inner}>
        <View style={[styles.iconCircle, { backgroundColor: '#E6F9EF' }]}>
          <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
        </View>

        <Text style={[styles.heading, { color: T.text }]}>{content.heading}</Text>
        <Text style={[styles.body, { color: T.textSec }]}>{content.body}</Text>
      </View>

      <PrimaryButton onPress={() => router.replace('/login' as never)}>
        Continue to Login
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingBottom: 40 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  iconCircle: {
    width: 112, height: 112, borderRadius: 56,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  heading: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center',
    fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 14,
  },
  body: {
    fontSize: 15, lineHeight: 24, textAlign: 'center',
    fontFamily: 'PlusJakartaSans_400Regular',
  },
});
