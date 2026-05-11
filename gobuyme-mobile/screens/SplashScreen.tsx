import React, { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';

export default function SplashScreen() {
  const { theme: T } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/onboarding'), 3000);
    return () => clearTimeout(timer);
  }, []);

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
