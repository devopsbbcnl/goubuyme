import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { usePaystack } from 'react-native-paystack-webview';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useAddress } from '@/context/AddressContext';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

const DELIVERY_FEE = 800;

const TYPE_ICONS: Record<string, any> = { home: 'home', work: 'business', other: 'location-on' };

export default function CheckoutScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { items, total, clearCart } = useCart();
  const { user } = useAuth();
  const { selected, addresses } = useAddress();
  const [loading, setLoading] = useState(false);

  const { popup } = usePaystack();

  const subtotal   = total;
  const grandTotal = subtotal + DELIVERY_FEE;

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
        items.map(item => api.post('/cart/add', { menuItemId: item.id, quantity: item.qty })),
      );

      // 2. Create the order in the DB
      const orderRes = await api.post('/orders', {
        deliveryAddressId: selected.id,
        paymentMethod: 'CARD',
      });
      const order = orderRes.data.data;
      const orderId: string = order.id;
      const orderNumber: string = order.orderNumber;
      const estimatedTime: number | null = order.estimatedTime ?? null;

      // 3. Generate a unique reference locally — popup.checkout() initialises
      //    its own Paystack transaction; calling /payments/initialize first
      //    would create a duplicate reference and Paystack would reject it.
      const reference = `GBM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 4. Open Paystack popup — library handles client-side initialisation
      popup.checkout({
        email: user?.email ?? 'customer@gobuyme.ng',
        amount: order.totalAmount ?? grandTotal, // naira — library multiplies by 100 internally
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
          clearCart();
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
            <TotalRow label="Delivery Fee" value={`₦${DELIVERY_FEE.toLocaleString()}`} T={T} />
            <View style={[styles.grandRow, { borderTopColor: T.border }]}>
              <Text style={[styles.grandLabel, { color: T.text }]}>Total</Text>
              <Text style={[styles.grandValue, { color: T.primary }]}>₦{grandTotal.toLocaleString()}</Text>
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
          disabled={loading}
          style={[styles.payBtn, { backgroundColor: loading ? T.surface3 : T.primary }]}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="lock-closed-outline" size={16} color="#fff" />
              <Text style={styles.payBtnText}>Pay ₦{grandTotal.toLocaleString()}</Text>
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
});
