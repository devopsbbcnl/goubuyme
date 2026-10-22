import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';

type Role = 'customer' | 'vendor' | 'rider';
type Category = 'orders' | 'earnings' | 'account';

interface Prefs {
  marketingOptIn: boolean;
  categories: Record<Category, boolean>;
}

const isExpoGo = Constants.appOwnership === 'expo';

// The categories are the ones the server filters on; only the wording changes by role.
const COPY: Record<Role, Record<Category, { label: string; sub: string }>> = {
  customer: {
    orders: { label: 'Order updates', sub: 'Confirmed, ready, picked up, delivered or cancelled' },
    earnings: { label: 'Credit & rewards', sub: 'Store credit and referral rewards' },
    account: { label: 'Account', sub: 'Security alerts and support replies' },
  },
  vendor: {
    orders: { label: 'Orders', sub: 'New orders, cancellations and reminders' },
    earnings: { label: 'Payouts', sub: 'When a payout is sent to you' },
    account: { label: 'Account', sub: 'Approval status, policy changes and support replies' },
  },
  rider: {
    orders: { label: 'Deliveries', sub: 'New jobs, assignments and cancellations' },
    earnings: { label: 'Earnings & payouts', sub: 'Payouts and rewards' },
    account: { label: 'Account', sub: 'Approval status, security alerts and support replies' },
  },
};

const CATEGORIES: Category[] = ['orders', 'earnings', 'account'];

interface Props {
  role: Role;
  onBack: () => void;
}

// Each switch is saved to the server, which is what decides whether a notification
// is sent and kept in the inbox. Switched off means neither pushed nor listed.
export default function NotificationSettingsScreen({ role, onBack }: Props) {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences')
      .then(res => setPrefs(res.data.data))
      .catch(() => setError("Couldn't load your settings. Check your connection and try again."));
  }, []);

  // The phone's own permission overrides everything above, so say so when it is off.
  useEffect(() => {
    if (isExpoGo) return;
    Notifications.getPermissionsAsync().then(p => setBlocked(p.status === 'denied')).catch(() => {});
  }, []);

  const save = useCallback(async (change: { marketingOptIn?: boolean; categories?: Partial<Record<Category, boolean>> }) => {
    const before = prefs;
    setPrefs(prev => prev && {
      marketingOptIn: change.marketingOptIn ?? prev.marketingOptIn,
      categories: { ...prev.categories, ...change.categories },
    });
    setError(null);
    try {
      const res = await api.patch('/notifications/preferences', change);
      setPrefs(res.data.data);
    } catch {
      setPrefs(before);
      setError("Couldn't save that change. Check your connection and try again.");
    }
  }, [prefs]);

  const row = (label: string, sub: string, value: boolean, onChange: (v: boolean) => void, last: boolean) => (
    <View key={label} style={[styles.row, { borderBottomColor: T.border, borderBottomWidth: last ? 0 : 1 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.rowLabel, { color: T.text }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: T.textSec }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        disabled={prefs === null}
        onValueChange={onChange}
        trackColor={{ false: T.surface3, true: T.primary }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Notification settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {blocked && (
          <TouchableOpacity
            onPress={() => { void Linking.openSettings(); }}
            style={[styles.banner, { backgroundColor: T.errorBg }]}
          >
            <Ionicons name="notifications-off" size={18} color={T.error} />
            <Text style={[styles.bannerText, { color: T.error }]}>
              Notifications are blocked for GoBuyMe on this phone. Tap to open settings and allow them.
            </Text>
          </TouchableOpacity>
        )}

        {!!error && <Text style={{ color: T.error, fontSize: 13 }}>{error}</Text>}

        <View>
          <Text style={[styles.sectionTitle, { color: T.textMuted }]}>ALERTS</Text>
          <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
            {CATEGORIES.map((c, i) =>
              row(
                COPY[role][c].label,
                COPY[role][c].sub,
                prefs?.categories[c] ?? true,
                v => { void save({ categories: { [c]: v } }); },
                i === CATEGORIES.length - 1,
              ),
            )}
          </View>
          <Text style={[styles.note, { color: T.textMuted }]}>
            Anything switched on is sent to your phone and kept in your notifications. Anything switched off is not sent.
            Announcements from GoBuyMe and messages from our team always come through.
          </Text>
        </View>

        <View>
          <Text style={[styles.sectionTitle, { color: T.textMuted }]}>PROMOTIONS</Text>
          <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
            {row(
              'Deals & offers',
              'Discounts, free delivery and news by push, email and SMS',
              prefs?.marketingOptIn ?? false,
              v => { void save({ marketingOptIn: v }); },
              true,
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 4 },
  bannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  card: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 10 },
});
