import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';

interface InboxItem {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const PAGE_SIZE = 30;

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  order: 'receipt-outline',
  job: 'bicycle-outline',
  payout: 'wallet-outline',
  store_credit: 'wallet-outline',
  referral: 'gift-outline',
  account: 'person-circle-outline',
  support_ticket: 'chatbubble-ellipses-outline',
  admin_message: 'chatbubble-ellipses-outline',
  broadcast: 'megaphone-outline',
  campaign: 'pricetag-outline',
};

const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

interface Props {
  /** Route of this role's notification settings screen. */
  settingsRoute: string;
  onBack: () => void;
}

// Every notification the user chose to receive, newest first. One screen for all
// three roles; each role's route file just supplies where back and settings go.
export default function NotificationInboxScreen({ settingsRoute, onBack }: Props) {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (p: number, mode: 'replace' | 'append') => {
    try {
      const res = await api.get('/notifications', { params: { page: p, limit: PAGE_SIZE } });
      const rows: InboxItem[] = res.data.data ?? [];
      setItems(prev => (mode === 'append' && prev ? [...prev, ...rows] : rows));
      setPage(p);
      setHasMore(p < (res.data.pagination?.totalPages ?? 1));
      setFailed(false);
    } catch {
      if (mode === 'replace') setFailed(true);
    }
  }, []);

  // Reload on every visit so a notification that arrived while away is there.
  useFocusEffect(useCallback(() => { void load(1, 'replace'); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1, 'replace');
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await load(page + 1, 'append');
    setLoadingMore(false);
  };

  const open = (item: InboxItem) => {
    if (item.isRead) return;
    setItems(prev => prev?.map(n => (n.id === item.id ? { ...n, isRead: true } : n)) ?? prev);
    api.patch(`/notifications/${item.id}/read`).catch(() => {
      setItems(prev => prev?.map(n => (n.id === item.id ? { ...n, isRead: false } : n)) ?? prev);
    });
  };

  const unread = items?.filter(n => !n.isRead).length ?? 0;

  const markAllRead = () => {
    const before = items;
    setItems(prev => prev?.map(n => ({ ...n, isRead: true })) ?? prev);
    api.patch('/notifications/read-all').catch(() => setItems(before));
  };

  const renderItem = ({ item }: { item: InboxItem }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => open(item)}
      style={[styles.row, { backgroundColor: item.isRead ? T.surface : T.primaryTint, borderColor: T.border }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: T.surface2 }]}>
        <Ionicons name={ICONS[item.type] ?? 'notifications-outline'} size={20} color={item.isRead ? T.textSec : T.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.rowTitle, { color: T.text }]} numberOfLines={2}>{item.title}</Text>
          {!item.isRead && <View style={[styles.dot, { backgroundColor: T.primary }]} />}
        </View>
        <Text style={[styles.rowBody, { color: T.textSec }]}>{item.body}</Text>
        <Text style={[styles.rowTime, { color: T.textMuted }]}>{timeAgo(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Notifications</Text>
        <TouchableOpacity
          onPress={() => router.push(settingsRoute as never)}
          style={styles.headerBtn}
          accessibilityLabel="Notification settings"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={21} color={T.text} />
        </TouchableOpacity>
      </View>

      {items === null && !failed ? (
        <View style={styles.center}><ActivityIndicator color={T.primary} /></View>
      ) : failed && items === null ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={T.textMuted} />
          <Text style={[styles.emptyTitle, { color: T.text }]}>Couldn't load notifications</Text>
          <TouchableOpacity onPress={() => { setFailed(false); void load(1, 'replace'); }}>
            <Text style={{ color: T.primary, fontWeight: '700', fontSize: 14 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, (items?.length ?? 0) === 0 && { flex: 1 }]}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            unread > 0 ? (
              <TouchableOpacity onPress={markAllRead} style={styles.markAll}>
                <Text style={{ color: T.primary, fontWeight: '700', fontSize: 13 }}>Mark all as read ({unread})</Text>
              </TouchableOpacity>
            ) : null
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={T.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={44} color={T.textMuted} />
              <Text style={[styles.emptyTitle, { color: T.text }]}>Nothing here yet</Text>
              <Text style={[styles.emptySub, { color: T.textSec }]}>
                Order updates and announcements will show up here. You can choose what to hear about in settings.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  list: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  markAll: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 4, borderWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 9999, marginTop: 5 },
  rowBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  rowTime: { fontSize: 11, marginTop: 6 },
});
