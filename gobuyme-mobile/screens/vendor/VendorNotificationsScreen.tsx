import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotifSetting {
  id: string;
  section: string;
  label: string;
  sub: string;
  enabled: boolean;
}

const INITIAL_SETTINGS: NotifSetting[] = [
  // Orders
  {
    id: 'order_new',
    section: 'Orders',
    label: 'New Order Received',
    sub: 'Alert when a customer places an order',
    enabled: true,
  },
  {
    id: 'order_cancelled',
    section: 'Orders',
    label: 'Order Cancelled',
    sub: 'When a customer cancels before pickup',
    enabled: true,
  },
  {
    id: 'order_reminder',
    section: 'Orders',
    label: 'Preparation Reminder',
    sub: 'Reminder when rider is approaching',
    enabled: true,
  },
  // Reviews
  {
    id: 'review_new',
    section: 'Reviews',
    label: 'New Customer Review',
    sub: 'When a customer rates your store',
    enabled: true,
  },
  {
    id: 'review_low',
    section: 'Reviews',
    label: 'Low Rating Alert',
    sub: 'When you receive 1–2 star reviews',
    enabled: true,
  },
  // Account
  {
    id: 'acct_status',
    section: 'Account',
    label: 'Account Status Changes',
    sub: 'Approval, suspension, or reactivation',
    enabled: true,
  },
  {
    id: 'acct_policy',
    section: 'Account',
    label: 'Policy & Compliance',
    sub: 'Updates that affect your store',
    enabled: true,
  },
  {
    id: 'acct_promo',
    section: 'Account',
    label: 'Platform Promotions',
    sub: 'Campaigns you can opt your store into',
    enabled: false,
  },
];

export default function VendorNotificationsScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<NotifSetting[]>(INITIAL_SETTINGS);

  const toggle = (id: string) =>
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );

  const sections = [...new Set(settings.map((s) => s.section))];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Notifications</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoBanner, { backgroundColor: T.primaryTint }]}>
          <Ionicons name="notifications" size={18} color={T.primary} />
          <Text style={[styles.infoText, { color: T.primary }]}>
            Push notifications are enabled for this device
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section} style={{ marginBottom: 4 }}>
            <Text style={[styles.sectionTitle, { color: T.textMuted }]}>
              {section.toUpperCase()}
            </Text>
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: T.surface, borderColor: T.border },
              ]}
            >
              {settings
                .filter((s) => s.section === section)
                .map((s, i, arr) => (
                  <View
                    key={s.id}
                    style={[
                      styles.row,
                      {
                        borderBottomColor: T.border,
                        borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={[styles.rowLabel, { color: T.text }]}>
                        {s.label}
                      </Text>
                      <Text style={[styles.rowSub, { color: T.textSec }]}>
                        {s.sub}
                      </Text>
                    </View>
                    <Switch
                      value={s.enabled}
                      onValueChange={() => toggle(s.id)}
                      trackColor={{ false: T.surface3, true: T.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    paddingTop: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 4,
  },
  infoText: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
});
