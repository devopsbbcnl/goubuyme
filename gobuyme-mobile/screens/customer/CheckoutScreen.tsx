import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { usePaystack } from 'react-native-paystack-webview';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useAddress } from '@/context/AddressContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import { calculateDistance, calculateRouteDistance } from '@/services/geocoding';
import Constants from 'expo-constants';

const TYPE_ICONS: Record<string, any> = { home: 'home', work: 'business', other: 'location-on' };

export default function CheckoutScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { clearCart, getItems, getTotal } = useCart();
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const vid = vendorId ?? '';
  const items = getItems(vid);
  const total = getTotal(vid);
  const { user } = useAuth();
  const { selected, addresses } = useAddress();
  const [loading, setLoading] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [addressCoords, setAddressCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoSource, setGeoSource] = useState<'stored' | 'geocoded' | 'missing' | null>(null);
  const [vendor, setVendor] = useState<{
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null>(null);

  const { popup } = usePaystack();

  const subtotal   = total;
  const grandTotal = subtotal + (deliveryFee ?? 0);

  const isNigeriaCoordinate = (lat: number, lng: number) => {
    return lat >= 4 && lat <= 14 && lng >= 2 && lng <= 15;
  };

  // Fetch vendor location
  useEffect(() => {
    if (vid) {
      api.get(`/vendors/${vid}`).then(async res => {
        const vendorData = res.data.data;
        console.log('[Checkout] Vendor fetch success:', { vid, lat: vendorData.latitude, lng: vendorData.longitude });
        // Save vendor info including address fields
        setVendor({
          latitude: vendorData.latitude ?? null,
          longitude: vendorData.longitude ?? null,
          address: vendorData.address ?? vendorData.location ?? null,
          city: vendorData.city ?? null,
          state: vendorData.state ?? null,
        });

        // If vendor lacks coords, attempt to geocode vendor address using backend
        if ((vendorData.latitude == null || vendorData.longitude == null) && (vendorData.address || vendorData.city || vendorData.state)) {
          try {
            const geoRes = await api.get('/geocode', {
              params: {
                address: vendorData.address,
                city: vendorData.city,
                state: vendorData.state,
              },
            });
            const geoData = geoRes.data?.data;
            if (geoData?.lat != null && geoData?.lng != null) {
              console.log('[Checkout] Geocoded vendor address:', { lat: geoData.lat, lng: geoData.lng, query: geoData.query });
              setVendor(v => ({ ...(v ?? {}), latitude: geoData.lat, longitude: geoData.lng }));
            }
          } catch (e) {
            console.warn('[Checkout] Vendor geocode failed', e);
          }
        }
      }).catch(err => {
        console.error('[Checkout] Vendor fetch failed:', { vid, error: err?.message });
      });
    }
  }, [vid]);

  // Calculate distance and delivery fee when address and vendor are available
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!selected) {
        console.log('[Checkout] No address selected');
        if (mounted) {
          setDeliveryFee(null);
          setDistance(null);
          setAddressCoords(null);
          setGeoSource(null);
        }
        return;
      }

      const selectedLat = selected.latitude as number | undefined;
      const selectedLng = selected.longitude as number | undefined;
      const selectedValid = selectedLat != null && selectedLng != null && isNigeriaCoordinate(selectedLat, selectedLng);
      const selectedQuery = [selected.address, selected.city, selected.state]
        .filter(Boolean)
        .join(', ');

      console.log('[Checkout] Selected address:', {
        label: selected.label,
        address: selected.address,
        city: selected.city,
        state: selected.state,
        query: selectedQuery,
        hasCoords: selectedLat != null && selectedLng != null,
        latitude: selectedLat,
        longitude: selectedLng,
        isNigeriaCoord: selectedValid,
      });

      if (!vendor) {
        console.log('[Checkout] Vendor not loaded yet');
        return;
      }

      const vendorValid = vendor.latitude != null && vendor.longitude != null && isNigeriaCoordinate(vendor.latitude, vendor.longitude);
      if (!vendorValid) {
        console.warn('[Checkout] Vendor coordinates invalid or outside Nigeria:', vendor);
        return;
      }

      setFeeLoading(true);

      try {
        let lat = selected.latitude as number | undefined;
        let lng = selected.longitude as number | undefined;
        let source: 'stored' | 'geocoded' | 'missing' = 'stored';

        // If saved address lacks coordinates, try to geocode the full address text using backend
        if ((lat == null || lng == null) && selected.address) {
          console.log('[Checkout] Address has no coords, attempting geocode via backend');
          try {
            const geoRes = await api.get('/geocode', {
              params: {
                address: selected.address,
                city: selected.city,
                state: selected.state,
              },
            });
            const geoData = geoRes.data?.data;
            if (geoData?.lat != null && geoData?.lng != null) {
              lat = geoData.lat;
              lng = geoData.lng;
              source = 'geocoded';
              console.log('[Checkout] Geocoded to:', { lat, lng, query: geoData.query });
            } else {
              source = 'missing';
              console.log('[Checkout] Backend geocoding failed - no results');
            }
          } catch (geoErr) {
            console.error('[Checkout] Backend geocoding error:', geoErr);
            source = 'missing';
          }
        }

        const addressCoordsValid = lat != null && lng != null && isNigeriaCoordinate(lat, lng);
        if (!addressCoordsValid && lat != null && lng != null) {
          console.warn('[Checkout] Address coordinates are outside Nigeria bounds:', { lat, lng });
        }

        if (addressCoordsValid && vendor.latitude != null && vendor.longitude != null) {
          const dist = await calculateRouteDistance(
            vendor.latitude,
            vendor.longitude,
            lat!,
            lng!,
          );
          console.log('[Checkout] Route calculated:', { distance: dist, vendor: { lat: vendor.latitude, lng: vendor.longitude }, address: { lat, lng } });
          // Sanity check: distances > 500km are probably erroneous for local deliveries
          if (dist > 500) {
            console.warn('[Checkout] Route distance implausible, aborting:', { distance: dist });
            if (!mounted) return;
            setDistance(null);
            setAddressCoords(null);
            setGeoSource('missing');
            setDeliveryFee(null);
            return;
          }
          if (!mounted) return;
          setDistance(dist);
          setAddressCoords({ latitude: lat!, longitude: lng! });
          setGeoSource(source);
          
          // Call backend to calculate delivery fee
          try {
            const feeRes = await api.get(`/orders/estimate-fee?addressId=${selected.id}`);
            const fee = feeRes.data?.data?.deliveryFee;
            if (fee != null) {
              setDeliveryFee(fee);
              console.log('[Checkout] Backend delivery fee:', { fee, distance: dist });
            } else {
              console.warn('[Checkout] Backend did not return delivery fee');
              setDeliveryFee(null);
            }
          } catch (feeErr) {
            console.error('[Checkout] Failed to fetch delivery fee from backend:', feeErr);
            setDeliveryFee(null);
          }
        } else {
          // Could not determine coords for selected address
          console.log('[Checkout] Could not determine address coordinates');
          if (!mounted) return;
          setDeliveryFee(null);
          setDistance(null);
          setAddressCoords(null);
          setGeoSource(source);
        }
      } catch (err) {
        console.error('[Checkout] Error calculating fee:', err);
        if (mounted) {
          setDeliveryFee(null);
          setDistance(null);
          setAddressCoords(null);
          setGeoSource('missing');
        }
      } finally {
        if (mounted) setFeeLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [selected, vendor]);

  const handlePay = async () => {
    if (addresses.length === 0) {
      Alert.alert('No delivery address', 'Please add a delivery address before placing your order.', [
        { text: 'Add Address', onPress: () => router.push('/saved-addresses') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (!selected) {
      Alert.alert('No address selected', 'Please select a delivery address.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Empty cart', 'Add items to your cart before checking out.');
      return;
    }

    setLoading(true);
    try {
      // 1. Sync in-memory cart to backend
      await api.delete('/cart/clear').catch(() => {});
      await Promise.all(
        items.map(item => api.post('/cart/add', { menuItemId: item.id, quantity: item.qty, unitPrice: item.price })),
      );

      // 2. Create the order in the DB — this is the single source of truth for pricing
      const orderRes = await api.post('/orders', {
        deliveryAddressId: selected.id,
        paymentMethod: 'CARD',
      });
      const order = orderRes.data.data;
      const orderId: string = order.id;
      const orderNumber: string = order.orderNumber;
      const estimatedTime: number | null = order.estimatedTime ?? null;
      const confirmedTotal: number = order.totalAmount;
      const confirmedDeliveryFee: number = order.deliveryFee;

      // 3. Generate a unique reference locally — popup.checkout() initialises
      //    its own Paystack transaction; calling /payments/initialize first
      //    would create a duplicate reference and Paystack would reject it.
      const reference = `GBM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 4. Open Paystack popup — amount is always the backend-confirmed total
      popup.checkout({
        email: user?.email ?? 'customer@gobuyme.ng',
        amount: Math.round(Number(confirmedTotal)), // naira — library multiplies by 100 internally
        currency: 'NGN',
        reference,
        onSuccess: async (paystackRes) => {
          const ref = paystackRes.reference ?? paystackRes.transaction ?? paystackRes.trans ?? reference;
          try {
            // Pass orderId so the backend can locate the order even though
            // no paystackRef was pre-saved (the backend saves it on verify).
            await api.post('/payments/verify', { reference: ref, orderId });
          } catch {
            // network hiccup — backend webhook will reconcile
          }
          clearCart(vid);
          setLoading(false);
          router.replace({
            pathname: '/tracking',
            params: {
              orderId,
              orderNumber,
              estimatedTime: estimatedTime != null ? String(estimatedTime) : '',
            },
          });
        },
        onCancel: () => {
          setLoading(false);
          Alert.alert('Payment cancelled', 'Your order is saved. Complete payment to confirm it.');
        },
        onError: (error) => {
          console.error('[Paystack] Payment error:', error);
          setLoading(false);
          Alert.alert('Payment error', error?.message ?? 'Paystack payment failed. Please try again.');
        },
      });
    } catch (err: any) {
      setLoading(false);
      const msg = err?.response?.data?.message ?? 'Failed to place order. Please try again.';
      Alert.alert('Order failed', msg);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Delivery Address ── */}
        <Text style={[styles.sectionTitle, { color: T.textSec }]}>Delivery Address</Text>
        {selected ? (
          <TouchableOpacity
            onPress={() => router.push('/saved-addresses')}
            style={[styles.addressCard, { backgroundColor: T.surface, borderColor: T.border }]}
            activeOpacity={0.75}
          >
            <View style={[styles.addressIcon, { backgroundColor: T.primaryTint }]}>
              <MaterialIcons name={TYPE_ICONS[selected.type] ?? 'location-on'} size={18} color={T.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.addressName, { color: T.text }]}>{selected.label}</Text>
              <Text style={[styles.addressSub, { color: T.textSec }]}>{selected.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.textSec} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push('/saved-addresses')}
            style={[styles.addressCard, styles.addressCardEmpty, { backgroundColor: T.surface, borderColor: T.primary }]}
            activeOpacity={0.75}
          >
            <View style={[styles.addressIcon, { backgroundColor: T.primaryTint }]}>
              <Ionicons name="add" size={20} color={T.primary} />
            </View>
            <Text style={[styles.addressName, { color: T.primary }]}>Add a delivery address</Text>
            <Ionicons name="chevron-forward" size={16} color={T.primary} />
          </TouchableOpacity>
        )}

        {/* ── Order Summary ── */}
        <Text style={[styles.sectionTitle, { color: T.textSec, marginTop: 24 }]}>Order Summary</Text>
        <View style={[styles.orderCard, { backgroundColor: T.surface, borderColor: T.border }]}>
          {items.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                { borderBottomColor: T.border, borderBottomWidth: i < items.length - 1 ? 1 : 0 },
              ]}
            >
              <View style={styles.itemThumb}>
                <Image source={{ uri: item.img }} style={{ width: '100%', height: '100%' }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: T.text }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[styles.itemQty, { color: T.textSec }]}>Qty: {item.qty}</Text>
              </View>
              <Text style={[styles.itemPrice, { color: T.text }]}>
                ₦{(item.price * item.qty).toLocaleString()}
              </Text>
            </View>
          ))}

          {/* Totals */}
          <View style={[styles.totalsBlock, { borderTopColor: T.border }]}>
            <TotalRow label="Subtotal" value={`₦${subtotal.toLocaleString()}`} T={T} />
            {distance !== null && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: T.textSec }]}>Distance</Text>
                <Text style={[styles.totalVal, { color: T.text }]}>{distance.toFixed(1)} km</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: T.textSec }]}>Delivery Fee</Text>
              {feeLoading ? (
                <ActivityIndicator size="small" color={T.primary} />
              ) : deliveryFee !== null ? (
                <Text style={[styles.totalVal, { color: T.text }]}>₦{deliveryFee.toLocaleString()}</Text>
              ) : (
                <Text style={[styles.totalVal, { color: T.textMuted, fontStyle: 'italic' }]}>Select an address</Text>
              )}
            </View>
            <View style={[styles.grandRow, { borderTopColor: T.border }]}>
              <Text style={[styles.grandLabel, { color: T.text }]}>Total</Text>
              {feeLoading || deliveryFee === null ? (
                <Text style={[styles.grandValue, { color: T.textMuted }]}>—</Text>
              ) : (
                <Text style={[styles.grandValue, { color: T.primary }]}>₦{grandTotal.toLocaleString()}</Text>
              )}
            </View>
          </View>
        </View>

        {__DEV__ && (
          <View style={[styles.debugBox, { backgroundColor: T.surface2, borderColor: T.border }]}> 
            <Text style={[styles.debugTitle, { color: T.text }]}>Checkout debug</Text>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Selected address</Text>
              <Text style={[styles.debugValue, { color: T.text }]} numberOfLines={2}>{selected?.address ?? 'None'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Selected coords</Text>
              <Text style={[styles.debugValue, { color: T.text }]}>
                {selected?.latitude != null && selected?.longitude != null
                  ? `${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`
                  : 'Missing'}
              </Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Address coords</Text>
              <Text style={[styles.debugValue, { color: T.text }]}> 
                {addressCoords?.latitude != null && addressCoords?.longitude != null
                  ? `${addressCoords.latitude.toFixed(6)}, ${addressCoords.longitude.toFixed(6)}`
                  : 'Missing'}
              </Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Geo source</Text>
              <Text style={[styles.debugValue, { color: T.text }]}>{geoSource ?? 'Pending'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Vendor coords</Text>
              <Text style={[styles.debugValue, { color: T.text }]}>
                {vendor?.latitude != null && vendor?.longitude != null
                  ? `${vendor.latitude.toFixed(6)}, ${vendor.longitude.toFixed(6)}`
                  : 'Unknown'}
              </Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={[styles.debugLabel, { color: T.textSec }]}>Distance (km)</Text>
              <Text style={[styles.debugValue, { color: T.text }]}>
                {distance != null ? distance.toFixed(2) : 'Calculating...'}
              </Text>
            </View>
          </View>
        )}

        {/* Paystack badge */}
        <View style={styles.securedRow}>
          <Ionicons name="lock-closed" size={12} color={T.textMuted} />
          <Text style={[styles.securedText, { color: T.textMuted }]}>Secured by Paystack</Text>
        </View>
      </ScrollView>

      {/* Pay CTA */}
      <View style={[styles.footer, { backgroundColor: T.surface, borderTopColor: T.border }]}>
        <TouchableOpacity
          onPress={handlePay}
          disabled={loading || feeLoading || deliveryFee === null}
          style={[styles.payBtn, { backgroundColor: loading || feeLoading || deliveryFee === null ? T.surface3 : T.primary }]}
          activeOpacity={0.85}
        >
          {loading || feeLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={16} color="#fff" />
              <Text style={styles.payBtnText}>
                {deliveryFee === null ? 'Select an address' : `Pay ₦${grandTotal.toLocaleString()}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

function TotalRow({ label, value, T }: { label: string; value: string; T: any }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: T.textSec }]}>{label}</Text>
      <Text style={[styles.totalVal, { color: T.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle:      { fontSize: 20, fontWeight: '800' },
  scroll:           { padding: 20, paddingBottom: 24 },
  sectionTitle:     { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  // Address
  addressCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, padding: 14, borderWidth: 1 },
  addressCardEmpty: { borderStyle: 'dashed', borderWidth: 1.5 },
  addressIcon:      { width: 40, height: 40, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  addressName:      { fontSize: 14, fontWeight: '600' },
  addressSub:       { fontSize: 12, marginTop: 2 },
  // Order card
  orderCard:        { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  itemRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemThumb:        { width: 52, height: 52, borderRadius: 4, overflow: 'hidden', flexShrink: 0, backgroundColor: '#ccc' },
  itemName:         { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  itemQty:          { fontSize: 12, marginTop: 3 },
  itemPrice:        { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  // Totals
  totalsBlock:      { borderTopWidth: 1, padding: 14, gap: 8 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel:       { fontSize: 13 },
  totalVal:         { fontSize: 13, fontWeight: '600' },
  grandRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, marginTop: 4 },
  grandLabel:       { fontSize: 16, fontWeight: '700' },
  grandValue:       { fontSize: 18, fontWeight: '800' },
  // Secured badge
  securedRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14 },
  securedText:      { fontSize: 11 },
  // Footer
  footer:           { borderTopWidth: 1, padding: 20, paddingBottom: 36 },
  payBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 4 },
  payBtnText:       { color: '#fff', fontSize: 16, fontWeight: '800' },
  debugBox:         { borderWidth: 1, borderRadius: 4, marginTop: 16, padding: 12, gap: 8 },
  debugTitle:       { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  debugRow:         { gap: 4, marginBottom: 4 },
  debugLabel:       { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  debugValue:       { fontSize: 12, fontWeight: '600' },
});
