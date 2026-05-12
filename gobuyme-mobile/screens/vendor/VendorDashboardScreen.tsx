import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Animated, ActivityIndicator, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';
import api from '@/services/api';
import { connectSockets } from '@/services/socketService';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OrderStatus = 'new' | 'preparing' | 'ready';

interface Order {
  orderId: string;       // DB uuid for API calls
  id: string;            // display orderNumber
  customer: string;
  items: string[];
  total: number;
  time: string;
  status: OrderStatus;
}

interface Stats {
  todayOrders: number;
  pendingOrders: number;
  todayRevenue: number;
  rating: number;
  weeklyOrders: number[];
}

interface Earnings {
  thisMonth: { amount: number; orders: number };
  pendingPayout: number;
  allTime: { amount: number; orders: number };
}

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  new:       { label: 'New Order', color: '#F5A623', bg: 'rgba(245,166,35,0.12)' },
  preparing: { label: 'Preparing', color: '#1A6EFF', bg: 'rgba(26,110,255,0.12)' },
  ready:     { label: 'Ready',     color: '#1A9E5F', bg: 'rgba(26,158,95,0.12)' },
};

const mapStatus = (s: string): OrderStatus => {
  if (s === 'PREPARING') return 'preparing';
  if (s === 'READY')     return 'ready';
  return 'new'; // PENDING and CONFIRMED both need vendor acceptance
};

const formatMoney = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString()}`;
};

export default function VendorDashboardScreen() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [storeOpen,   setStoreOpen]   = useState(false);
  const [storeName,   setStoreName]   = useState('My Store');
  const [storeLogo,   setStoreLogo]   = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<'orders' | 'earnings'>('orders');
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [earnings,    setEarnings]    = useState<Earnings | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setNotification(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2400),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setNotification(null));
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get('/vendors/me/orders');
      const mapped: Order[] = res.data.data.map((o: any) => ({
        orderId: o.id,
        id: o.orderNumber,
        customer: o.customer,
        items: o.items,
        total: o.total,
        time: new Date(o.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
        status: mapStatus(o.status),
      }));
      setOrders(mapped);
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, statsRes, earningsRes] = await Promise.allSettled([
        api.get('/vendors/me'),
        api.get('/vendors/me/stats'),
        api.get('/vendors/me/earnings'),
      ]);

      if (profileRes.status === 'fulfilled') {
        const v = profileRes.value.data.data;
        setStoreName(v.businessName);
        setStoreLogo(v.logo);
        setStoreOpen(v.isOpen);
      }
      if (statsRes.status === 'fulfilled')    setStats(statsRes.value.data.data);
      if (earningsRes.status === 'fulfilled') setEarnings(earningsRes.value.data.data);
      await fetchOrders();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchOrders]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time: new order arrives without needing a pull-to-refresh
  useEffect(() => {
    const { ordersSocket } = connectSockets(user?.token ?? undefined);

    const onNewOrder = ({ order }: { order: any }) => {
      const mapped: Order = {
        orderId:  order.id,
        id:       order.orderNumber,
        customer: order.customer ?? '—',
        items:    (order.items ?? []).map((i: any) => `${i.name} x${i.quantity}`),
        total:    order.totalAmount ?? order.subtotal ?? 0,
        time:     new Date(order.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
        status:   'new',
      };
      setOrders(prev => [mapped, ...prev.filter(o => o.orderId !== order.id)]);
      showToast(`New order: ${order.orderNumber}`);
    };

    ordersSocket.on('order:new', onNewOrder);
    return () => { ordersSocket.off('order:new', onNewOrder); };
  }, [user?.token]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleStoreToggle = async () => {
    const prev = storeOpen;
    setStoreOpen(!prev);
    try {
      await api.patch('/vendors/me/status');
    } catch {
      setStoreOpen(prev);
      showToast('Failed to update store status');
    }
  };

  const handleOrderAction = async (order: Order, action: 'accept' | 'ready') => {
    try {
      await api.patch(`/vendors/me/orders/${order.orderId}/status`, { action });
      if (action === 'accept') {
        setOrders(prev => prev.map(o => o.orderId === order.orderId ? { ...o, status: 'preparing' } : o));
      } else {
        setOrders(prev => prev.map(o => o.orderId === order.orderId ? { ...o, status: 'ready' } : o));
      }
    } catch {
      showToast('Failed to update order');
    }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    try {
      await api.patch(`/vendors/me/orders/${rejectTarget.orderId}/status`, {
        action: 'reject',
        ...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
      });
      setOrders(prev => prev.filter(o => o.orderId !== rejectTarget.orderId));
      showToast(`Order ${rejectTarget.id} rejected`);
      setRejectTarget(null);
      setRejectReason('');
    } catch {
      showToast('Failed to reject order');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const newCount = orders.filter(o => o.status === 'new').length;

  const weekData = stats?.weeklyOrders ?? Array(7).fill(0);
  const maxVal   = Math.max(...weekData, 1);

  const statsCards = [
    { label: "Today's Orders",  value: stats ? String(stats.todayOrders)          : '–', icon: '📦', color: '#1A6EFF' },
    { label: "Today's Revenue", value: stats ? formatMoney(stats.todayRevenue)     : '–', icon: '💰', color: '#1A9E5F' },
    { label: 'Avg Rating',      value: stats ? (stats.rating ?? 0).toFixed(1)     : '–', icon: '⭐', color: '#F5A623' },
    { label: 'Pending',         value: stats ? String(stats.pendingOrders) : String(newCount), delta: 'live', icon: '🔔', color: T.primary },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Toast */}
      {notification && (
        <Animated.View style={[
          styles.toast,
          { backgroundColor: T.primary, ...shadows.primaryGlow(T.primary) },
          { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
        ]}>
          <Text style={styles.toastText}>{notification}</Text>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.primary} colors={[T.primary]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: T.textSec }]}>Good day 👋</Text>
            <Text style={[styles.storeName, { color: T.text }]}>{storeName}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={handleStoreToggle}
              style={[
                styles.toggleBtn,
                { backgroundColor: storeOpen ? 'rgba(26,158,95,0.15)' : 'rgba(226,59,59,0.12)', borderColor: storeOpen ? '#1A9E5F' : '#E23B3B' },
              ]}
            >
              <View style={[styles.toggleDot, { backgroundColor: storeOpen ? '#1A9E5F' : '#E23B3B' }]} />
              <Text style={[styles.toggleText, { color: storeOpen ? '#1A9E5F' : '#E23B3B' }]}>
                {storeOpen ? 'Open' : 'Closed'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(vendor)/profile')} activeOpacity={0.8}>
              {storeLogo ? (
                <Image source={{ uri: storeLogo }} style={styles.storeAvatar} />
              ) : (
                <View style={[styles.storeAvatar, { backgroundColor: T.primary }]}>
                  <Text style={{ fontSize: 16 }}>🍛</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {statsCards.map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: T.surface, borderColor: T.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                {'delta' in s && (
                  <Text style={[styles.statDelta, { color: T.primary, backgroundColor: T.primaryTint }]}>
                    {(s as any).delta}
                  </Text>
                )}
              </View>
              <Text style={[styles.statValue, { color: T.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: T.textSec }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Weekly chart */}
        <View style={[styles.chartCard, { backgroundColor: T.surface, borderColor: T.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: T.text }]}>Weekly Orders</Text>
            <Text style={[styles.chartSub, { color: T.textSec }]}>This week</Text>
          </View>
          <View style={styles.bars}>
            {weekData.map((v, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[
                  styles.bar,
                  { height: (v / maxVal) * 44, backgroundColor: i === 6 ? T.primary : `${T.primary}44` },
                ]} />
                <Text style={[styles.barLabel, { color: i === 6 ? T.text : T.textMuted }]}>{WEEK_LABELS[i]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['orders', 'earnings'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabBtn,
                {
                  backgroundColor: activeTab === tab ? T.primaryTint : T.surface,
                  borderColor: activeTab === tab ? T.primary : T.border,
                  borderWidth: activeTab === tab ? 1.5 : 1,
                },
              ]}
            >
              <Text style={[styles.tabLabel, { color: activeTab === tab ? T.primary : T.textSec }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
          {/* Orders tab */}
          {activeTab === 'orders' && (
            orders.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: T.surface, borderColor: T.border }]}>
                <Text style={{ fontSize: 28 }}>📭</Text>
                <Text style={[styles.emptyText, { color: T.textSec }]}>No active orders</Text>
              </View>
            ) : (
              orders.map(o => {
                const meta = STATUS_META[o.status];
                return (
                  <View key={o.orderId} style={[styles.orderCard, { backgroundColor: T.surface, borderColor: T.border }]}>
                    <View style={styles.orderTop}>
                      <View>
                        <Text style={[styles.orderId, { color: T.text }]}>{o.id}</Text>
                        <Text style={[styles.orderCustomer, { color: T.textSec }]}>{o.customer}</Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.orderItems, { color: T.textSec }]}>{o.items.join(' · ')}</Text>
                    <View style={styles.orderBottom}>
                      <View>
                        <Text style={[styles.orderTotal, { color: T.primary }]}>₦{o.total.toLocaleString()}</Text>
                        <Text style={[styles.orderTime, { color: T.textMuted }]}>{o.time}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {o.status === 'new' && (
                          <>
                            <TouchableOpacity
                              onPress={() => handleOrderAction(o, 'accept')}
                              style={[styles.actionBtn, { backgroundColor: T.primary }]}
                            >
                              <Text style={styles.actionBtnText}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setRejectTarget(o)}
                              style={[styles.actionBtnOutline, { borderColor: T.border }]}
                            >
                              <Text style={[styles.actionBtnOutlineText, { color: T.error }]}>Reject</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {o.status === 'preparing' && (
                          <TouchableOpacity
                            onPress={() => handleOrderAction(o, 'ready')}
                            style={[styles.actionBtn, { backgroundColor: '#1A6EFF' }]}
                          >
                            <Text style={styles.actionBtnText}>Mark Ready</Text>
                          </TouchableOpacity>
                        )}
                        {o.status === 'ready' && (
                          <View style={[styles.awaitingBadge, { backgroundColor: 'rgba(26,158,95,0.15)' }]}>
                            <Text style={[styles.awaitingText, { color: '#1A9E5F' }]}>Awaiting Rider</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )
          )}

          {/* Earnings tab */}
          {activeTab === 'earnings' && (
            <>
              {[
                {
                  label: 'This Month',
                  value: earnings ? formatMoney(earnings.thisMonth.amount) : '–',
                  sub: earnings ? `${earnings.thisMonth.orders} orders completed` : 'Loading…',
                  color: '#1A9E5F',
                  icon: '📅',
                },
                {
                  label: 'Pending Payout',
                  value: earnings ? formatMoney(earnings.pendingPayout) : '–',
                  sub: earnings ? 'Paid out automatically' : 'Loading…',
                  color: '#F5A623',
                  icon: '⏳',
                },
                {
                  label: 'All Time',
                  value: earnings ? formatMoney(earnings.allTime.amount) : '–',
                  sub: earnings ? `${earnings.allTime.orders} total orders` : 'Loading…',
                  color: T.primary,
                  icon: '🏆',
                },
              ].map(e => (
                <View key={e.label} style={[styles.earningsCard, { backgroundColor: T.surface, borderColor: T.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.earningsLabel, { color: T.textSec }]}>{e.label}</Text>
                    <Text style={[styles.earningsValue, { color: e.color }]}>{e.value}</Text>
                    <Text style={[styles.earningsSub, { color: T.textMuted }]}>{e.sub}</Text>
                  </View>
                  <View style={[styles.earningsIcon, { backgroundColor: `${e.color}18` }]}>
                    <Text style={{ fontSize: 22 }}>{e.icon}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Reject reason modal */}
      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !rejectSubmitting && (setRejectTarget(null), setRejectReason(''))}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalBox, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>Reject Order</Text>
            <Text style={[styles.modalSub, { color: T.textSec }]}>
              {rejectTarget?.id} · Why are you rejecting this order?
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: T.text, borderColor: T.border, backgroundColor: T.bg },
              ]}
              placeholder="e.g. Out of stock, closing early…"
              placeholderTextColor={T.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={200}
              editable={!rejectSubmitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setRejectTarget(null); setRejectReason(''); }}
                disabled={rejectSubmitting}
                style={[styles.modalCancelBtn, { backgroundColor: T.surface2, borderColor: T.border }]}
              >
                <Text style={[styles.modalBtnText, { color: T.textSec }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReject}
                disabled={rejectSubmitting}
                style={[styles.modalRejectBtn, { opacity: rejectSubmitting ? 0.6 : 1 }]}
              >
                {rejectSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Reject Order</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  toast:              { position: 'absolute', top: 72, left: 16, right: 16, zIndex: 200, borderRadius: 4, padding: 12 },
  toastText:          { fontSize: 14, fontWeight: '700', color: '#fff' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 0 },
  greeting:           { fontSize: 12, fontWeight: '500' },
  storeName:          { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  headerRight:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleBtn:          { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  toggleDot:          { width: 8, height: 8, borderRadius: 4 },
  toggleText:         { fontSize: 12, fontWeight: '700' },
  storeAvatar:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  statCard:           { width: '47%', borderRadius: 4, padding: 14, borderWidth: 1 },
  statDelta:          { fontSize: 11, fontWeight: '700', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 7 },
  statValue:          { fontSize: 22, fontWeight: '800', marginTop: 8, letterSpacing: -0.5 },
  statLabel:          { fontSize: 11, marginTop: 2 },
  chartCard:          { marginHorizontal: 20, marginTop: 14, borderRadius: 4, padding: 14, borderWidth: 1 },
  chartHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartTitle:         { fontSize: 13, fontWeight: '700' },
  chartSub:           { fontSize: 11 },
  bars:               { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  barCol:             { flex: 1, alignItems: 'center', gap: 4 },
  bar:                { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel:           { fontSize: 9, fontWeight: '600' },
  tabRow:             { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginTop: 14 },
  tabBtn:             { flex: 1, paddingVertical: 9, borderRadius: 4, alignItems: 'center' },
  tabLabel:           { fontSize: 12, fontWeight: '700' },
  emptyState:         { alignItems: 'center', gap: 8, paddingVertical: 32, borderRadius: 4, borderWidth: 1 },
  emptyText:          { fontSize: 13 },
  orderCard:          { borderRadius: 4, padding: 14, borderWidth: 1 },
  orderTop:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  orderId:            { fontSize: 13, fontWeight: '800' },
  orderCustomer:      { fontSize: 12, marginTop: 1 },
  statusPill:         { borderRadius: 4, paddingVertical: 3, paddingHorizontal: 9 },
  statusPillText:     { fontSize: 11, fontWeight: '700' },
  orderItems:         { fontSize: 12, marginBottom: 10 },
  orderBottom:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderTotal:         { fontSize: 16, fontWeight: '800' },
  orderTime:          { fontSize: 11, marginTop: 1 },
  actionBtn:          { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 4 },
  actionBtnText:      { fontSize: 12, fontWeight: '700', color: '#fff' },
  actionBtnOutline:   { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 12, fontWeight: '700' },
  awaitingBadge:      { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 4 },
  awaitingText:       { fontSize: 12, fontWeight: '700' },
  earningsCard:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 4, padding: 16, borderWidth: 1 },
  earningsLabel:      { fontSize: 12, marginBottom: 4 },
  earningsValue:      { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  earningsSub:        { fontSize: 11, marginTop: 3 },
  earningsIcon:       { width: 48, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:           { width: '100%', borderRadius: 4, borderWidth: 1, padding: 20, gap: 14 },
  modalTitle:         { fontSize: 16, fontWeight: '800' },
  modalSub:           { fontSize: 12, marginTop: -6 },
  modalInput:         { borderWidth: 1, borderRadius: 4, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  modalActions:       { flexDirection: 'row', gap: 10 },
  modalCancelBtn:     { flex: 1, paddingVertical: 10, borderRadius: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, minHeight: 40 },
  modalRejectBtn:     { flex: 1, paddingVertical: 10, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E23B3B', minHeight: 40 },
  modalBtnText:       { fontSize: 13, fontWeight: '700' },
});
