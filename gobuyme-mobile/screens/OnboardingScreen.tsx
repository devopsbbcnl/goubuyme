import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Image,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    photo: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=90',
    accent: '#FF521B',
    tag: '🍛 Food · Grocery · Pharmacy',
    headline: 'Jollof in\n25 minutes.',
    sub: 'Order from your favourite spots — food, groceries, pharmacy, and more.',
  },
  {
    photo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=90',
    accent: '#1A9E5F',
    tag: '🏪 Vendors · Restaurants · Shops',
    headline: 'Sell to thousands.\nStress less.',
    sub: 'List your store, accept orders, and get paid daily. We handle delivery.',
  },
  {
    photo: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=90',
    accent: '#1A6EFF',
    tag: '🏍️ Riders · Flexible Hours',
    headline: 'Ride. Earn.\nRepeat.',
    sub: 'Flexible hours. Weekly cash-out. Top riders earn ₦150k+ per month.',
  },
];

export default function OnboardingScreen() {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  const next = () => {
    if (isLast) router.replace('/role-select');
    else setIdx(i => i + 1);
  };

  return (
    <View style={styles.container}>
      {/* Full-bleed photo */}
      <Image source={{ uri: slide.photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

      {/* Base dark overlay — top fade */}
      <View style={[StyleSheet.absoluteFillObject, styles.overlayTop]} />
      {/* Bottom accent tint */}
      <View style={[StyleSheet.absoluteFillObject, styles.overlayBottom, { backgroundColor: `${slide.accent}28` }]} />
      {/* Extra readability overlay for slide 2 */}
      {idx === 1 && <View style={[StyleSheet.absoluteFillObject, styles.overlayDark]} />}

      {/* Skip */}
      <TouchableOpacity onPress={() => router.replace('/role-select')} style={styles.skipBtn}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Back button */}
      {idx > 0 && (
        <TouchableOpacity onPress={() => setIdx(i => i - 1)} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      )}

      {/* Bottom content */}
      <View style={styles.bottomContent}>
        {/* Tag */}
        <View style={styles.tagPill}>
          <Text style={styles.tagText}>{slide.tag}</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>{slide.headline}</Text>

        {/* Sub */}
        <Text style={styles.sub}>{slide.sub}</Text>

        {/* Dots + CTA */}
        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setIdx(i)}>
                <View style={[
                  styles.dot,
                  i === idx
                    ? { width: 32, backgroundColor: '#fff' }
                    : { width: 5, backgroundColor: 'rgba(255,255,255,0.3)' }
                ]} />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={next}
            style={[
              styles.ctaBtn,
              { backgroundColor: slide.accent, shadowColor: slide.accent },
              isLast && styles.ctaBtnPill,
            ]}
          >
            {isLast
              ? <Text style={styles.ctaText}>Get Started</Text>
              : <Ionicons name="chevron-forward" size={24} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlayTop:  { backgroundColor: 'rgba(0,0,0,0.35)' },
  overlayBottom: { top: '45%' },
  overlayDark: { backgroundColor: 'rgba(0,0,0,0.45)' },
  skipBtn: {
    position: 'absolute', top: 48, right: 20, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)', fontFamily: 'PlusJakartaSans_600SemiBold' },
  backBtn: {
    position: 'absolute', top: 48, left: 20, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  bottomContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 48 },
  tagPill: {
    alignSelf: 'flex-start', marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  tagText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)', fontFamily: 'PlusJakartaSans_600SemiBold' },
  headline: {
    fontSize: 42, fontWeight: '800', color: '#fff',
    lineHeight: 48, letterSpacing: -1.5, marginBottom: 14,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
  },
  sub: {
    fontSize: 15, color: 'rgba(255,255,255,0.75)',
    lineHeight: 24, marginBottom: 32, maxWidth: 300,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot:    { height: 5, borderRadius: 3 },
  ctaBtn: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },
  ctaBtnPill: { width: 'auto', paddingHorizontal: 28 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'PlusJakartaSans_700Bold' },
});
