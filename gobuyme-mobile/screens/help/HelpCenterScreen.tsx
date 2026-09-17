import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { FAQ_FOR_ROLE, STATUS_LABEL, TicketSummary, timeAgo } from './helpShared';

export default function HelpCenterScreen() {
  const { theme: T } = useTheme();
  const { role } = useAuth();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/support/tickets');
      setTickets(data.data ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the screen regains focus, e.g. after opening a ticket or creating one.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const faqs = FAQ_FOR_ROLE[role ?? 'customer'];
  const statusColor = (s: TicketSummary['status']) =>
    s === 'RESOLVED' || s === 'CLOSED' ? T.success : s === 'PENDING_REQUESTER' ? T.warning : T.info;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Help & Support</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.primary} />}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/help/new')}
          style={[styles.newBtn, { backgroundColor: T.primary }]}
        >
          <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.newBtnTitle}>Contact support</Text>
            <Text style={styles.newBtnSub}>We usually reply within a few hours</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        <View>
          <Text style={[styles.section, { color: T.textSec }]}>MY REQUESTS</Text>
          {loading ? (
            <ActivityIndicator color={T.primary} style={{ marginVertical: 20 }} />
          ) : failed ? (
            <TouchableOpacity onPress={load} style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
              <Text style={{ color: T.textSec, fontSize: 13 }}>Couldn&apos;t load your requests. Tap to retry.</Text>
            </TouchableOpacity>
          ) : tickets.length === 0 ? (
            <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
              <Text style={{ color: T.textSec, fontSize: 13 }}>You haven&apos;t contacted support yet.</Text>
            </View>
          ) : (
            <View style={[styles.list, { backgroundColor: T.surface, borderColor: T.border }]}>
              {tickets.map((t, i) => (
                <TouchableOpacity
                  key={t.id}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/help/${t.id}`)}
                  style={[styles.row, i < tickets.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.border }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {t.requesterUnread && <View style={[styles.dot, { backgroundColor: T.primary }]} />}
                      <Text numberOfLines={1} style={[styles.rowTitle, { color: T.text, fontWeight: t.requesterUnread ? '800' : '600' }]}>
                        {t.subject}
                      </Text>
                    </View>
                    <Text style={{ color: T.textMuted, fontSize: 12 }}>
                      #{t.number} · {timeAgo(t.lastMessageAt)}{t.requesterUnread ? ' · New reply' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.status, { color: statusColor(t.status) }]}>{STATUS_LABEL[t.status]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={[styles.section, { color: T.textSec }]}>COMMON QUESTIONS</Text>
          <View style={[styles.list, { backgroundColor: T.surface, borderColor: T.border }]}>
            {faqs.map((f, i) => (
              <TouchableOpacity
                key={f.q}
                activeOpacity={0.75}
                onPress={() => setOpenFaq(openFaq === i ? null : i)}
                style={[styles.faq, i < faqs.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.border }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.rowTitle, { color: T.text, flex: 1 }]}>{f.q}</Text>
                  <Ionicons name={openFaq === i ? 'chevron-up' : 'chevron-down'} size={16} color={T.textMuted} />
                </View>
                {openFaq === i && <Text style={{ color: T.textSec, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{f.a}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, padding: 16 },
  newBtnTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  newBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 4, padding: 16 },
  list: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  rowTitle: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 12, fontWeight: '700' },
  faq: { paddingHorizontal: 14, paddingVertical: 14 },
});
