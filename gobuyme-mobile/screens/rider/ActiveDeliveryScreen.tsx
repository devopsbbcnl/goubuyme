import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Linking, ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { useRiderLocation, RiderPosition } from '@/hooks/useRiderLocation';
import { connectSockets } from '@/services/socketService';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_VENDOR_COORD: [number, number] = [7.0348, 5.4836];
const DEFAULT_CUSTOMER_COORD: [number, number] = [7.0421, 5.4912];

const DELIVERY_STEPS = [
  { label: 'Heading to vendor', sub: 'ETA 3 min', icon: 'navigate', cta: 'Arrived at Vendor' },
  { label: 'Order picked up', sub: 'Heading to customer', icon: 'cube', cta: 'Mark as Delivered' },
  { label: 'Delivered', sub: 'Great job', icon: 'checkmark-circle', cta: 'Done' },
] as const;

type NavApp = 'google_maps' | 'waze' | 'in_app';

export default function ActiveDeliveryScreen() {
  useKeepAwake();

  const { theme: T } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const params = useLocalSearchParams<{
    orderId?: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
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
  const customerPhone = params.customerPhone ?? '';
  const fee = params.fee ? parseInt(params.fee, 10) : 0;
  const orderNumber = params.orderNumber ?? '';

  // Coords stored as [lng, lat] to match the existing convention in this file
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

  const { position: riderPosition } = useRiderLocation(user?.id ?? null, isActive);

  const [advancing, setAdvancing] = useState(false);

  const handleCall = () => {
    if (!customerPhone) return;
    Linking.openURL(`tel:${customerPhone}`).catch(() => {
      Alert.alert('Error', 'Unable to make a call. Please check your phone settings.');
    });
  };

  const navigateToDestination = async () => {
    const navPref = (await AsyncStorage.getItem('rider_nav_app') ?? 'in_app') as NavApp;

    // Step 0 = heading to vendor, step 1 = heading to customer
    const destLat = stepIdx === 0 ? vendorCoord[1] : customerCoord[1];
    const destLng = stepIdx === 0 ? vendorCoord[0] : customerCoord[0];

    if (navPref === 'google_maps') {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
      Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Google Maps.'));
    } else if (navPref === 'waze') {
      const wazeScheme = `waze://ul?ll=${destLat},${destLng}&navigate=yes`;
      const canOpen = await Linking.canOpenURL(wazeScheme).catch(() => false);
      if (canOpen) {
        Linking.openURL(wazeScheme);
      } else {
        Linking.openURL(`https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`).catch(() =>
          Alert.alert('Error', 'Could not open Waze.')
        );
      }
    } else {
      // In-app: animate the map to the destination
      mapRef.current?.animateToRegion(
        { latitude: destLat, longitude: destLng, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        800,
      );
    }
  };

  const advanceStep = async () => {
    if (stepIdx >= DELIVERY_STEPS.length - 1) {
      router.replace('/(rider)');
      return;
    }

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
        <TouchableOpacity onPress={() => router.navigate('/(rider)/jobs' as any)}>
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Active Delivery</Text>
        <View style={[styles.jobIdBadge, { backgroundColor: T.primaryTint }]}>
          <Text style={[styles.jobIdText, { color: T.primary }]}>{orderNumber}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.mapContainer}>
          <DeliveryMap
            mapRef={mapRef}
            midCoord={midCoord}
            vendorCoord={vendorCoord}
            customerCoord={customerCoord}
            riderPosition={riderPosition}
            primaryColor={T.primary}
            stepIdx={stepIdx}
          />

          <View style={[styles.liveBadge, { backgroundColor: T.primary }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>

          <View style={styles.etaChip}>
            <Ionicons name="flash" size={11} color={T.primary} />
            <Text style={styles.etaText}>{stepIdx === 0 ? '3 min' : '8 min'} away</Text>
          </View>

          {stepIdx < 2 && (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={navigateToDestination}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={13} color="#fff" />
              <Text style={styles.navBtnText}>Navigate</Text>
            </TouchableOpacity>
          )}
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
          <View style={styles.customerHeader}>
            <View style={[styles.customerAvatar, { backgroundColor: T.surface3 }]}>
              <Ionicons name="person" size={20} color={T.textSec} />
            </View>
            <Text style={[styles.customerName, { color: T.text, flex: 1 }]}>{customerName || '—'}</Text>
            <View style={styles.contactBtns}>
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: T.surface2, borderColor: T.border }]}
                onPress={() => router.push(`/(rider)/rider-chat?orderId=${orderId}` as any)}
              >
                <Ionicons name="chatbubble-outline" size={15} color={T.text} />
              </TouchableOpacity>
              {customerPhone ? (
                <TouchableOpacity
                  style={[styles.contactBtn, { backgroundColor: T.primaryTint, borderColor: T.primary }]}
                  onPress={handleCall}
                >
                  <Ionicons name="call-outline" size={15} color={T.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={[styles.infoRow, { marginTop: 10 }]}>
            <Ionicons name="location-outline" size={13} color={T.textSec} style={{ marginTop: 1 }} />
            <Text style={[styles.customerAddr, { color: T.textSec, flex: 1 }]}>
              {customerAddress || '—'}
            </Text>
          </View>
          <View style={[styles.infoRow, { marginTop: 6 }]}>
            <Ionicons name="call-outline" size={13} color={T.textSec} />
            <Text style={[styles.customerPhone, { color: T.textSec }]}>{customerPhone || '—'}</Text>
          </View>
        </View>

        <View style={[styles.earningsRow, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.earningsLabel, { color: T.textSec }]}>Your earnings for this delivery</Text>
          <Text style={[styles.earningsVal, { color: '#1A9E5F' }]}>+₦{Math.round(fee * 0.85).toLocaleString()}</Text>
        </View>
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16, backgroundColor: T.bg, borderTopColor: T.border }]}>
        <PrimaryButton onPress={advanceStep} loading={advancing} disabled={advancing}>
          {step.cta}
        </PrimaryButton>
      </View>
    </View>
  );
}

function DeliveryMap({
  mapRef,
  midCoord,
  vendorCoord,
  customerCoord,
  riderPosition,
  primaryColor,
  stepIdx,
}: {
  mapRef: React.RefObject<MapView>;
  midCoord: [number, number];
  vendorCoord: [number, number];
  customerCoord: [number, number];
  riderPosition: RiderPosition | null;
  primaryColor: string;
  stepIdx: number;
}) {
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: midCoord[1],
        longitude: midCoord[0],
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }}
    >
      <Polyline
        coordinates={[
          { latitude: vendorCoord[1], longitude: vendorCoord[0] },
          { latitude: customerCoord[1], longitude: customerCoord[0] },
        ]}
        strokeColor={primaryColor}
        strokeWidth={2}
        lineDashPattern={[8, 5]}
      />

      <Marker coordinate={{ latitude: vendorCoord[1], longitude: vendorCoord[0] }}>
        <View style={[styles.mapPin, { backgroundColor: primaryColor }]}>
          <Ionicons name="storefront" size={12} color="#fff" />
        </View>
      </Marker>

      <Marker coordinate={{ latitude: customerCoord[1], longitude: customerCoord[0] }}>
        <View style={[styles.mapPin, { backgroundColor: '#1A9E5F' }]}>
          <Ionicons name="person" size={12} color="#fff" />
        </View>
      </Marker>

      {riderPosition && (
        <Marker coordinate={riderPosition} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.riderPin, { backgroundColor: primaryColor }]}>
            <Ionicons name="navigate" size={13} color="#fff" />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle:    { fontSize: 20, fontWeight: '800', flex: 1 },
  jobIdBadge:     { borderRadius: 4, paddingVertical: 5, paddingHorizontal: 12 },
  jobIdText:      { fontSize: 12, fontWeight: '700' },
  mapContainer:   { marginHorizontal: 20, borderRadius: 4, height: 210, overflow: 'hidden', position: 'relative' },
  mapPin:         { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  riderPin:       { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  liveBadge:      { position: 'absolute', top: 12, left: 12, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText:       { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  etaChip:        { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingVertical: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  etaText:        { fontSize: 12, fontWeight: '700', color: '#fff' },
  navBtn:         { position: 'absolute', bottom: 10, left: 12, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  navBtnText:     { fontSize: 11, fontWeight: '700', color: '#fff' },
  card:           { marginHorizontal: 20, marginTop: 12, borderRadius: 4, padding: 16, borderWidth: 1 },
  statusRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  statusIcon:     { width: 48, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  statusLabel:    { fontSize: 16, fontWeight: '800' },
  statusSub:      { fontSize: 12, marginTop: 2 },
  progressTrack:  { height: 5, borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 3 },
  stepLabels:     { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel:      { fontSize: 10, fontWeight: '600' },
  customerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  customerName:   { fontSize: 14, fontWeight: '700' },
  contactBtns:    { flexDirection: 'row', gap: 8 },
  contactBtn:     { width: 34, height: 34, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  customerAddr:   { fontSize: 12, lineHeight: 17 },
  customerPhone:  { fontSize: 12 },
  earningsRow:    { marginHorizontal: 20, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1 },
  ctaBar:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1 },
  earningsLabel:  { fontSize: 13 },
  earningsVal:    { fontSize: 18, fontWeight: '800' },
});
