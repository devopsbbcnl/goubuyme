import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, TextInput,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DELIVERY_FEE = 800;

export default function CartScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { items, addItem, clearCart, total } = useCart();
  const [note, setNote] = useState('');

  const grandTotal = total + DELIVERY_FEE;

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
        <Text style={{ fontSize: 60 }}>🛒</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: T.text, marginTop: 16 }}>Your cart is empty</Text>
        <Text style={{ fontSize: 14, color: T.textSec, marginTop: 8 }}>Add items to get started</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.browseBtn, { backgroundColor: T.primary, ...shadows.primaryGlow(T.primary) }]}
        >
          <Text style={styles.browseBtnText}>Browse Restaurants</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Your Cart</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
        {/* Cart items */}
        {items.map(item => (
          <View
            key={item.id}
            style={[styles.cartItem, { backgroundColor: T.surface, borderColor: T.border }]}
          >
            <View style={styles.cartItemImg}>
              <Image source={{ uri: item.img }} style={{ width: '100%', height: '100%' }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: T.text }]}>{item.name}</Text>
              <Text style={[styles.itemTotal, { color: T.primary }]}>
                ₦{(item.price * item.qty).toLocaleString()}
              </Text>
            </View>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                onPress={() => addItem({ id: item.id, name: item.name, price: item.price, img: item.img }, -1)}
                style={[styles.qtyBtn, { backgroundColor: T.surface3 }]}
              >
                <Ionicons name="remove" size={12} color={T.text} />
              </TouchableOpacity>
              <Text style={[styles.qtyText, { color: T.text }]}>{item.qty}</Text>
              <TouchableOpacity
                onPress={() => addItem({ id: item.id, name: item.name, price: item.price, img: item.img }, 1)}
                style={[styles.qtyBtn, { backgroundColor: T.primary }]}
              >
                <Ionicons name="add" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Delivery note */}
        <View style={[styles.noteBox, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.noteLabel, { color: T.textSec }]}>Delivery note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="E.g. gate code, floor number..."
            placeholderTextColor={T.textMuted}
            style={[styles.noteInput, { color: T.text }]}
          />
        </View>
      </ScrollView>

      {/* Summary + CTA */}
      <View style={[styles.summary, { backgroundColor: T.surface, borderTopColor: T.border }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: T.textSec }]}>Subtotal</Text>
          <Text style={[styles.summaryVal, { color: T.text }]}>₦{total.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: T.textSec }]}>Delivery</Text>
          <Text style={[styles.summaryVal, { color: T.text }]}>₦{DELIVERY_FEE.toLocaleString()}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: T.border }]} />
        <View style={[styles.summaryRow, { marginBottom: 16 }]}>
          <Text style={[styles.totalLabel, { color: T.text }]}>Total</Text>
          <Text style={[styles.totalVal, { color: T.primary }]}>₦{grandTotal.toLocaleString()}</Text>
        </View>
        <PrimaryButton onPress={() => router.push('/checkout')}>
          Proceed to Checkout
        </PrimaryButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  browseBtn:   { marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 4 },
  browseBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cartItem:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, padding: 14, borderWidth: 1 },
  cartItemImg: { width: 60, height: 60, borderRadius: 4, overflow: 'hidden', flexShrink: 0 },
  itemName:    { fontSize: 14, fontWeight: '600' },
  itemTotal:   { fontSize: 14, fontWeight: '800', marginTop: 4 },
  qtyRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn:      { width: 28, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  qtyText:     { fontSize: 15, fontWeight: '700', minWidth: 16, textAlign: 'center' },
  noteBox:     { borderRadius: 4, padding: 14, borderWidth: 1 },
  noteLabel:   { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  noteInput:   { fontSize: 13 },
  summary:     { borderTopWidth: 1, padding: 20, paddingBottom: 36 },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14 },
  summaryVal:   { fontSize: 14, fontWeight: '600' },
  divider:     { height: 1, marginVertical: 10 },
  totalLabel:  { fontSize: 16, fontWeight: '700' },
  totalVal:    { fontSize: 16, fontWeight: '800' },
});
