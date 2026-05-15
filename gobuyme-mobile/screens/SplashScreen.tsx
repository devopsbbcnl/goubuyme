import React, { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';

const ROLE_ROUTE = {
  customer: '/(customer)',
  vendor: '/(vendor)',
  rider: '/(rider)',
} as const;

export default function SplashScreen() {
  const { theme: T } = useTheme();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const target = user && role && ROLE_ROUTE[role] ? ROLE_ROUTE[role] : '/onboarding';
    const timer = setTimeout(() => router.replace(target), 3000);
    return () => clearTimeout(timer);
  }, [loading, role, user]);

  if (T.isDark) {
    return (
      <LinearGradient
        colors={['#FFB36B', '#FF9245', '#FF7235', '#FF521B']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <Image source={require('../assets/splash.png')} style={styles.splashImage} resizeMode="contain" />
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <Image source={require('../assets/splash.png')} style={styles.splashImage} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashImage: { width: 260, height: 260 },
});
