import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const CHANGELOG = [
  {
    version: '1.1.0',
    date: 'May 2025',
    tag: 'Latest',
    tagColor: '#1A9E5F',
    tagBg: '#1A9E5F18',
    items: [
      'Vendor promotions — create and manage promo cards visible in the customer feed',
      'Identity documents for riders — NIN, selfie, vehicle photo & guarantor details',
      'Inline profile editing for riders — name, phone, vehicle type and plate number',
      'Privacy & Security — change password, MFA setup, sign-out all devices',
      'Full Privacy Policy and Terms of Service (NDPR/NDPA compliant)',
      'Contact Support chat screen with topic-based routing',
      'Business Verification and Licenses & Permits screens for vendors',
    ],
  },
  {
    version: '1.0.0',
    date: 'April 2025',
    tag: 'Launch',
    tagColor: '#FF521B',
    tagBg: '#FF521B18',
    items: [
      'Customer app: home feed, vendor discovery, cart, checkout & Paystack payments',
      'Live order tracking with interactive MapLibre maps and Socket.io',
      'Vendor dashboard: order management, menu CRUD, earnings, commissions (TIER_1/TIER_2)',
      'Rider dashboard: available jobs, active delivery with GPS streaming',
      'Google OAuth, JWT authentication + two-factor authentication (TOTP/MFA)',
      'Admin dashboard: vendor/rider approvals, payout management, audit log',
      'Role-based onboarding: Customer, Vendor, Rider with KYC verification flow',
    ],
  },
];

export default function WhatsNewScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const goBack = () => (from ? router.navigate(from as any) : router.back());

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>What's New</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.versionBanner, { backgroundColor: T.primaryTint }]}>
          <Ionicons name="sparkles-outline" size={18} color={T.primary} />
          <Text style={[styles.versionBannerText, { color: T.primary }]}>
            You're on GoBuyMe v{APP_VERSION}
          </Text>
        </View>

        {CHANGELOG.map((entry) => (
          <View key={entry.version} style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
            <View style={styles.cardTop}>
              <View>
                <Text style={[styles.version, { color: T.text }]}>v{entry.version}</Text>
                <Text style={[styles.date, { color: T.textSec }]}>{entry.date}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: entry.tagBg }]}>
                <Text style={[styles.tagText, { color: entry.tagColor }]}>{entry.tag}</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: T.border }]} />

            {entry.items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={[styles.bullet, { backgroundColor: entry.tagColor }]} />
                <Text style={[styles.itemText, { color: T.textSec }]}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={[styles.footer, { color: T.textMuted }]}>
          More updates coming soon — stay tuned!
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  versionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 4, padding: 14,
  },
  versionBannerText: { fontSize: 14, fontWeight: '600' },
  card: { borderRadius: 4, borderWidth: 1, padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  version: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 12, marginTop: 2 },
  tag: { borderRadius: 4, paddingVertical: 3, paddingHorizontal: 10 },
  tagText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  itemText: { flex: 1, fontSize: 13, lineHeight: 20 },
  footer: { textAlign: 'center', fontSize: 12 },
});
