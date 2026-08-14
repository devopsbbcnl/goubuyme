import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Modal,
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
import { KeyboardAvoidingWrapper } from '@/components/ui/KeyboardAvoidingWrapper';

const TYPE_ICONS: Record<string, any> = { home: 'home', work: 'business', other: 'location-on' };

function formatPhoneForApi(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (!digits) return '';
  // Strip any already-applied "234" country-code prefix(es) so re-formatting an
  // already-formatted number is idempotent instead of stacking "234" repeatedly.
  while (digits.startsWith('234') && digits.length > 10) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `+234${digits}`;
}

export default function CheckoutScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { clearCart, getItems, getTotal } = useCart();
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const vid = vendorId ?? '';
  const items = getItems(vid);
  const total = getTotal(vid);
  const { user, updateUser } = useAuth();
  const { selected, addresses, ready: addressesReady, selectAddress } = useAddress();
  const [addressPickerVisible, setAddressPickerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(user?.phone ?? '');
  }, [user?.phone]);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [freeDeliveryReason, setFreeDeliveryReason] = useState<'THRESHOLD' | 'CREDIT' | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ code: string; subtotalDiscount: number; freeDelivery: boolean } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [deliveryFeeError, setDeliveryFeeError] = useState<string | null>(null);

  const { popup } = usePaystack();

  const subtotal   = total;
  // When free delivery applies (subtotal threshold, a referral credit, or a free-delivery promo),
  // the customer pays nothing for delivery regardless of the distance-based estimate.
  const deliveryIsFree = !!freeDeliveryReason || !!promo?.freeDelivery;
  const effectiveFee = deliveryIsFree ? 0 : deliveryFee;
  const promoSubtotalDiscount = promo?.subtotalDiscount ?? 0;
  const grandTotal = subtotal + (effectiveFee ?? 0) - promoSubtotalDiscount;

  // Delivery fee, distance, and free-delivery eligibility are all computed server-side by the
  // same pricing engine `placeOrder` uses — this is a read-only preview (no referral credit is
  // consumed until the order is actually placed), kept in sync with checkout so the displayed
  // total matches what the backend will confirm when the order is created.
  useEffect(() => {
    let active = true;
    // Wait for AddressContext to finish syncing with the server before trusting
    // selected.id — firing this against a stale AsyncStorage-cached id (present
    // during the brief window before the remote address list loads) gets a
    // false "Address not found" 404 from the backend. Mirrors the web checkout,
    // which only ever computes its selected address from the server response.
    if (!addressesReady || !vid || !selected?.id) {
      setDeliveryFee(null);
      setDistance(null);
      setFreeDeliveryReason(null);
      setDeliveryFeeError(null);
      return;
    }
    // Skip the request entirely for an address with no confirmed coordinates — the backend
    // will 400 on it anyway ("Address coordinates missing"), so surface the reason directly
    // instead of round-tripping to find out.
    if (selected.latitude == null || selected.longitude == null) {
      setDeliveryFee(null);
      setDistance(null);
      setFreeDeliveryReason(null);
      setDeliveryFeeError('This address has no confirmed location. Edit it to fix this.');
      return;
    }
    setFeeLoading(true);
    setDeliveryFeeError(null);
    api.get('/orders/estimate-fee', { params: { addressId: selected.id, vendorId: vid } })
      .then(res => {
        if (!active) return;
        const d = res.data?.data;
        setDeliveryFee(d?.deliveryFee ?? null);
        setDistance(d?.distanceKm ?? null);
        setFreeDeliveryReason(d?.freeDelivery ? (d.freeDeliveryReason ?? null) : null);
      })
      .catch((err) => {
        if (!active) return;
        setDeliveryFee(null);
        setDistance(null);
        setFreeDeliveryReason(null);
        setDeliveryFeeError(err?.response?.data?.message ?? 'Could not calculate delivery fee.');
      })
      .finally(() => { if (active) setFeeLoading(false); });
    return () => { active = false; };
  }, [addressesReady, vid, selected?.id, subtotal]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      // The validate endpoint reads the server-side cart, so push the in-memory cart first
      // (mirrors what handlePay does before placing the order).
      await api.delete('/cart/clear').catch(() => {});
      await Promise.all(
        items.map(item => api.post('/cart/add', {
          menuItemId: item.id,
          quantity: item.qty,
          unitPrice: item.price,
          ...(item.selections?.length ? { selections: item.selections } : {}),
        })),
      );
      const res = await api.get('/orders/validate-promo', { params: { code, vendorId: vid } });
      const r = res.data?.data;
      if (r?.valid) {
        setPromo({ code: r.code, subtotalDiscount: r.subtotalDiscount ?? 0, freeDelivery: !!r.freeDelivery });
      } else {
        setPromo(null);
        setPromoError(r?.reason ?? 'Invalid promo code.');
      }
    } catch (e: any) {
      setPromo(null);
      setPromoError(e?.response?.data?.message ?? 'Could not validate promo code.');
    } finally {
      setPromoLoading(false);
    }
  };

  const clearPromo = () => { setPromo(null); setPromoInput(''); setPromoError(null); };

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
    const formattedPhone = formatPhoneForApi(phone);
    if (!formattedPhone) {
      setPhoneError('A phone number is required so the rider or vendor can reach you.');
      return;
    }
    setPhoneError(null);

    setLoading(true);
    try {
      // 0. Save phone number to profile if it changed
      if (formattedPhone !== user?.phone) {
        await api.patch('/auth/profile', { phone: formattedPhone });
        await updateUser({ phone: formattedPhone });
      }

      // 1. Sync in-memory cart to backend
      await api.delete('/cart/clear').catch(() => {});
      await Promise.all(
        items.map(item => api.post('/cart/add', {
          menuItemId: item.id,
          quantity: item.qty,
          unitPrice: item.price,
          ...(item.selections?.length ? { selections: item.selections } : {}),
        })),
      );

      // 2. Create the order in the DB — this is the single source of truth for pricing
      const orderRes = await api.post('/orders', {
        deliveryAddressId: selected.id,
        paymentMethod: 'CARD',
        ...(promo ? { promoCode: promo.code } : {}),
      });
      const order = orderRes.data.data;
      const orderId: string = order.id;
      const orderNumber: string = order.orderNumber;
      const estimatedTime: number | null = order.estimatedTime ?? null;
      const confirmedTotal: number = order.totalAmount;
      const confirmedDeliveryFee: number = order.deliveryFee;

      // Sync displayed fee to what the backend actually calculated
      setDeliveryFee(confirmedDeliveryFee);

      // 3. Generate a unique reference locally — popup.checkout() initialises
      //    its own Paystack transaction; calling /payments/initialize first
      //    would create a duplicate reference and Paystack would reject it.
      const reference = `GBM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 4. Open Paystack popup — amount is always the backend-confirmed total
      popup.checkout({
        email: user?.email ?? 'customer@gobuyme.ng',
        amount: confirmedTotal, // naira — library multiplies by 100 internally
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
          api.post(`/orders/${orderId}/cancel-payment`, { reason: 'Payment cancelled by customer' }).catch(() => {});
          setLoading(false);
          Alert.alert('Payment cancelled', 'Your order was not placed. Your cart has been restored.');
        },
        onError: () => {
          api.post(`/orders/${orderId}/cancel-payment`, { reason: 'Payment failed or declined' }).catch(() => {});
          setLoading(false);
          Alert.alert('Payment failed', 'Your payment could not be completed. Your cart has been restored — please try again.');
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

      <KeyboardAvoidingWrapper>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Contact Number ── */}
        <Text style={[styles.sectionTitle, { color: T.textSec }]}>Contact Number</Text>
        <View style={[styles.orderCard, { backgroundColor: T.surface, borderColor: phoneError ? '#E5484D' : T.border, padding: 14, marginBottom: 24 }]}>
          <Text style={[styles.addressSub, { color: T.textSec, marginBottom: 8 }]}>
            Required so your rider or vendor can reach you about this delivery.
          </Text>
          <TextInput
            value={phone}
            onChangeText={t => { setPhone(t); setPhoneError(null); }}
            placeholder="+234 800 000 0000"
            placeholderTextColor={T.textMuted}
            keyboardType="phone-pad"
            style={{ borderWidth: 1, borderColor: phoneError ? '#E5484D' : T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: T.text }}
          />
          {phoneError && <Text style={{ color: '#E5484D', fontSize: 12, marginTop: 6 }}>{phoneError}</Text>}
        </View>

        {/* ── Delivery Address ── */}
        <Text style={[styles.sectionTitle, { color: T.textSec }]}>Delivery Address</Text>
        {selected ? (
          <TouchableOpacity
            onPress={() => setAddressPickerVisible(true)}
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
            <Text style={{ color: T.primary, fontSize: 12, fontWeight: '600' }}>Change</Text>
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
              ) : deliveryFee === null ? (
                <Text style={[styles.totalVal, { color: deliveryFeeError ? T.error : T.textMuted, fontStyle: 'italic' }]}>
                  {deliveryFeeError ?? 'Select an address'}
                </Text>
              ) : deliveryIsFree ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {deliveryFee > 0 && (
                    <Text style={[styles.totalVal, { color: T.textMuted, textDecorationLine: 'line-through', marginRight: 6 }]}>
                      ₦{deliveryFee.toLocaleString()}
                    </Text>
                  )}
                  <Text style={[styles.totalVal, { color: T.primary, fontWeight: '700' }]}>FREE</Text>
                </View>
              ) : (
                <Text style={[styles.totalVal, { color: T.text }]}>₦{deliveryFee.toLocaleString()}</Text>
              )}
            </View>
            {deliveryIsFree && (
              <Text style={{ color: T.primary, fontSize: 12, marginTop: 2 }}>
                {promo?.freeDelivery ? `Free delivery from code ${promo.code} 🎉`
                  : freeDeliveryReason === 'THRESHOLD' ? 'Free delivery unlocked on this order 🎉'
                  : 'Free delivery credit applied 🎉'}
              </Text>
            )}
            {promoSubtotalDiscount > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: T.textSec }]}>Promo ({promo?.code})</Text>
                <Text style={[styles.totalVal, { color: T.primary, fontWeight: '700' }]}>−₦{promoSubtotalDiscount.toLocaleString()}</Text>
              </View>
            )}

            {/* Promo code */}
            {promo ? (
              <View style={[styles.totalRow, { alignItems: 'center' }]}>
                <Text style={{ color: T.primary, fontWeight: '700', fontSize: 13 }}>✓ {promo.code} applied</Text>
                <TouchableOpacity onPress={clearPromo}>
                  <Text style={{ color: T.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={promoInput}
                    onChangeText={t => { setPromoInput(t.toUpperCase()); setPromoError(null); }}
                    placeholder="Promo code"
                    placeholderTextColor={T.textMuted}
                    autoCapitalize="characters"
                    style={{ flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: T.text }}
                  />
                  <TouchableOpacity
                    onPress={applyPromo}
                    disabled={promoLoading || !promoInput.trim()}
                    style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8, backgroundColor: promoLoading || !promoInput.trim() ? T.surface3 : T.primary }}
                  >
                    {promoLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Apply</Text>}
                  </TouchableOpacity>
                </View>
                {promoError && <Text style={{ color: '#e5484d', fontSize: 12, marginTop: 6 }}>{promoError}</Text>}
              </View>
            )}
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
      </KeyboardAvoidingWrapper>

      {/* Address picker — session-scoped selection for this order only, independent of
          which address is the account's default (setDefault is a separate, explicit action
          on the Saved Addresses screen). Mirrors the web checkout's radio-list picker. */}
      <Modal visible={addressPickerVisible} animationType="slide" transparent onRequestClose={() => setAddressPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>Delivery Address</Text>
              <TouchableOpacity onPress={() => setAddressPickerVisible(false)}>
                <Ionicons name="close" size={22} color={T.textSec} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              {addresses.map(addr => {
                const noLocation = addr.latitude == null || addr.longitude == null;
                return (
                  <TouchableOpacity
                    key={addr.id}
                    onPress={() => {
                      if (noLocation) {
                        Alert.alert(
                          'Location not confirmed',
                          'This address has no confirmed location, so delivery fee can\'t be calculated for it. Edit it from Saved Addresses to fix this.',
                        );
                        return;
                      }
                      selectAddress(addr.id);
                      setAddressPickerVisible(false);
                    }}
                    style={[
                      styles.pickerRow,
                      {
                        borderColor: selected?.id === addr.id ? T.primary : T.border,
                        backgroundColor: selected?.id === addr.id ? T.primaryTint : T.surface,
                        opacity: noLocation ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.addressIcon, { backgroundColor: T.primaryTint }]}>
                      <MaterialIcons name={TYPE_ICONS[addr.type] ?? 'location-on'} size={18} color={T.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.addressName, { color: T.text }]}>{addr.label}</Text>
                        {addr.isDefault && (
                          <Text style={{ color: T.primary, fontSize: 10, fontWeight: '700' }}>DEFAULT</Text>
                        )}
                        {noLocation && (
                          <Text style={{ color: T.error, fontSize: 10, fontWeight: '700' }}>NO LOCATION</Text>
                        )}
                      </View>
                      <Text style={[styles.addressSub, { color: T.textSec }]}>{addr.address}</Text>
                    </View>
                    {selected?.id === addr.id && (
                      <Ionicons name="checkmark-circle" size={20} color={T.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={() => { setAddressPickerVisible(false); router.push('/saved-addresses'); }}
              style={[styles.addRow, { borderColor: T.border }]}
              activeOpacity={0.75}
            >
              <Ionicons name="add-circle-outline" size={20} color={T.primary} />
              <Text style={{ color: T.primary, fontSize: 14, fontWeight: '600' }}>Add New Address</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  // Address picker modal
  modalBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:       { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40, gap: 12 },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle:       { fontSize: 17, fontWeight: '700' },
  pickerRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, borderWidth: 1.5, padding: 14, marginBottom: 10 },
  addRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed' },
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
});
