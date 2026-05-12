import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { connectSockets } from '@/services/socketService';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY && MAPTILER_KEY !== 'get_free_key_at_maptiler_com'
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

const DEFAULT_VENDOR_COORD: [number, number] = [7.0348, 5.4836];
const DEFAULT_CUSTOMER_COORD: [number, number] = [7.0421, 5.4912];

const DELIVERY_STEPS = [
  { label: 'Heading to vendor', sub: 'ETA 3 min', icon: 'navigate', cta: 'Arrived at Vendor' },
  { label: 'Order picked up', sub: 'Heading to customer', icon: 'cube', cta: 'Mark as Delivered' },
  { label: 'Delivered', sub: 'Great job', icon: 'checkmark-circle', cta: 'Done' },
] as const;

export default function ActiveDeliveryScreen() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId?: string;
    customerName?: string;
    customerAddress?: string;
    vendorLat?: string;
    vendorLng?: string;
    customerLat?: string;
    customerLng?: string;
    fee?: string;
    orderNumber?: string;
    status?: string;
  }>();

  const orderId = params.orderId ?? null;
  const customerName = params.customerName ?? '';
  const customerAddress = params.customerAddress ?? '';
  const fee = params.fee ? parseInt(params.fee, 10) : 0;
  const orderNumber = params.orderNumber ?? '';

  const vendorCoord: [number, number] = params.vendorLat && params.vendorLng
    ? [parseFloat(params.vendorLng), parseFloat(params.vendorLat)]
    : DEFAULT_VENDOR_COORD;

  const customerCoord: [number, number] = params.customerLat && params.customerLng
    ? [parseFloat(params.customerLng), parseFloat(params.customerLat)]
    : DEFAULT_CUSTOMER_COORD;

  function statusToStep(s?: string): number {
    if (s === 'PICKED_UP') return 1;
    if (s === 'DELIVERED') return 2;
    return 0;
  }

  const [stepIdx, setStepIdx] = useState(() => statusToStep(params.status));
  const progressAnim = useRef(new Animated.Value(statusToStep(params.status) / (DELIVERY_STEPS.length - 1))).current;
  const step = DELIVERY_STEPS[stepIdx];
  const isActive = stepIdx < DELIVERY_STEPS.length - 1;

  useRiderLocation(user?.id ?? null, isActive);

  const [advancing, setAdvancing] = useState(false);

  const advanceStep = async () => {
    if (stepIdx >= DELIVERY_STEPS.length - 1) {
      router.replace('/(rider)');
      return;
    }

    // Persist status transition to DB
    const statusMap: Record<number, 'PICKED_UP' | 'DELIVERED'> = { 0: 'PICKED_UP', 1: 'DELIVERED' };
    const newStatus = statusMap[stepIdx];
    if (orderId && newStatus) {
      setAdvancing(true);
      try {
        await api.patch(`/riders/me/orders/${orderId}/status`, { status: newStatus });
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? 'Failed to update status. Try again.';
        Alert.alert('Error', msg);
        setAdvancing(false);
        return;
      } finally {
        setAdvancing(false);
      }

      // Also emit socket so customer tracking screen updates in real-time
      try {
        const { ordersSocket } = connectSockets(user?.token ?? undefined);
        ordersSocket.emit('order:updateStatus', { orderId, status: newStatus });
      } catch { /* socket optional */ }
    }

    const next = (stepIdx + 1) / (DELIVERY_STEPS.length - 1);
    Animated.timing(progressAnim, { toValue: next, duration: 400, useNativeDriver: false }).start();
    setStepIdx(i => i + 1);
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const midCoord: [number, number] = [
    (vendorCoord[0] + customerCoord[0]) / 2,
    (vendorCoord[1] + customerCoord[1]) / 2,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Active Delivery</Text>
        <View style={[styles.jobIdBadge, { backgroundColor: T.primaryTint }]}>
          <Text style={[styles.jobIdText, { color: T.primary }]}>{orderNumber}</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <DeliveryMap
          midCoord={midCoord}
          vendorCoord={vendorCoord}
          customerCoord={customerCoord}
          primaryColor={T.primary}
        />

        <View style={styles.etaChip}>
          <Ionicons name="flash" size={11} color={T.primary} />
          <Text style={styles.etaText}>{stepIdx === 0 ? '3 min' : '8 min'} away</Text>
        </View>

        <View style={[styles.liveBadge, { backgroundColor: T.primary }]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, { backgroundColor: `${T.primary}1A` }]}>
            <Ionicons name={step.icon} size={24} color={T.primary} />
          </View>
          <View>
            <Text style={[styles.statusLabel, { color: T.text }]}>{step.label}</Text>
            <Text style={[styles.statusSub, { color: T.textSec }]}>{step.sub}</Text>
          </View>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: T.surface3 }]}>
          <Animated.View style={[styles.progressFill, { backgroundColor: T.primary, width: progressWidth }]} />
        </View>

        <View style={styles.stepLabels}>
          {['Pickup', 'Transit', 'Done'].map((label, i) => (
            <Text key={label} style={[styles.stepLabel, { color: i <= stepIdx ? T.primary : T.textMuted }]}>
              {label}
            </Text>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
        <View style={styles.customerRow}>
          <View style={[styles.customerAvatar, { backgroundColor: T.surface3 }]}>
            <Ionicons name="person" size={20} color={T.textSec} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.customerName, { color: T.text }]}>{customerName}</Text>
            <Text style={[styles.customerAddr, { color: T.textSec }]} numberOfLines={1}>
              {customerAddress}
            </Text>
          </View>
          <TouchableOpacity style={[styles.contactBtn, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="call-outline" size={16} color={T.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.contactBtn, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="chatbubble-outline" size={16} color={T.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.earningsRow, { backgroundColor: T.surface, borderColor: T.border }]}>
        <Text style={[styles.earningsLabel, { color: T.textSec }]}>Your earnings for this delivery</Text>
        <Text style={[styles.earningsVal, { color: '#1A9E5F' }]}>+N{fee}</Text>
      </View>

      <View style={{ padding: 20, paddingBottom: 36, marginTop: 'auto' }}>
        <PrimaryButton onPress={advanceStep} loading={advancing} disabled={advancing}>
          {step.cta}
        </PrimaryButton>
      </View>
    </View>
  );
}

function DeliveryMap({
  midCoord: _midCoord,
  vendorCoord: _vendorCoord,
  customerCoord: _customerCoord,
  primaryColor: _primaryColor,
}: {
  midCoord: [number, number];
  vendorCoord: [number, number];
  customerCoord: [number, number];
  primaryColor: string;
}) {
  return <MapFallback />;
}

function MapFallback() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.mapFallback}>
      {[25, 65, 105, 145, 185].map(top => (
        <View key={top} style={[styles.roadLine, { top }]} />
      ))}

      <View style={styles.routeRow}>
        <View style={styles.routePinOrange}>
          <Ionicons name="storefront" size={15} color="#FF521B" />
        </View>

        <View style={styles.routeDash} />

        <Animated.View style={[styles.riderBubble, { transform: [{ scale: pulse }] }]}>
          <Ionicons name="bicycle" size={15} color="#fff" />
        </Animated.View>

        <View style={styles.routeDash} />

        <View style={styles.routePinGreen}>
          <Ionicons name="person" size={15} color="#1A9E5F" />
        </View>
      </View>

      <Text style={styles.mapFallbackTitle}>Route active</Text>
      <Text style={styles.mapFallbackSub}>GPS streaming enabled · Stay on track</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle:    { fontSize: 20, fontWeight: '800', flex: 1 },
  jobIdBadge:     { borderRadius: 4, paddingVertical: 5, paddingHorizontal: 12 },
  jobIdText:      { fontSize: 12, fontWeight: '700' },
  mapContainer:   { marginHorizontal: 20, borderRadius: 4, height: 190, overflow: 'hidden', position: 'relative' },
  mapFallback:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#0C1525', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  roadLine:       { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  routeRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 18, paddingHorizontal: 24, width: '100%' },
  routePinOrange: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,82,27,0.15)', borderWidth: 1, borderColor: 'rgba(255,82,27,0.35)', alignItems: 'center', justifyContent: 'center' },
  routePinGreen:  { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(26,158,95,0.15)', borderWidth: 1, borderColor: 'rgba(26,158,95,0.35)', alignItems: 'center', justifyContent: 'center' },
  routeDash:      { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 6, borderRadius: 1 },
  riderBubble:    { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FF521B', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF521B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10, elevation: 8 },
  mapFallbackTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 5, textAlign: 'center' },
  mapFallbackSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center' },
  mapPin:         { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  etaChip:        { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingVertical: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  etaText:        { fontSize: 12, fontWeight: '700', color: '#fff' },
  liveBadge:      { position: 'absolute', top: 12, left: 12, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:       { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  card:           { marginHorizontal: 20, marginTop: 12, borderRadius: 4, padding: 16, borderWidth: 1 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  statusIcon:     { width: 48, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  statusLabel:    { fontSize: 16, fontWeight: '800' },
  statusSub:      { fontSize: 12, marginTop: 2 },
  progressTrack:  { height: 5, borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 3 },
  stepLabels:     { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel:      { fontSize: 10, fontWeight: '600' },
  customerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  customerName:   { fontSize: 14, fontWeight: '700' },
  customerAddr:   { fontSize: 12, marginTop: 1 },
  contactBtn:     { width: 38, height: 38, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  earningsRow:    { marginHorizontal: 20, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1 },
  earningsLabel:  { fontSize: 13 },
  earningsVal:    { fontSize: 18, fontWeight: '800' },
});
