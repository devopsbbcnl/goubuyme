import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CartHubScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { getVendorCarts } = useCart();
  const carts = getVendorCarts();

  if (carts.length === 0) {
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
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Your Carts</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
        {carts.map(cart => {
          const itemCount = cart.items.reduce((s, i) => s + i.qty, 0);
          const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
          return (
            <TouchableOpacity
              key={cart.vendorId}
              onPress={() => router.push({ pathname: '/cart/[vendorId]', params: { vendorId: cart.vendorId } })}
              style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}
            >
              {cart.vendorImage ? (
                <Image source={{ uri: cart.vendorImage }} style={styles.vendorImg} />
              ) : (
                <View style={[styles.vendorImg, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="storefront-outline" size={24} color={T.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.vendorName, { color: T.text }]} numberOfLines={1}>{cart.vendorName}</Text>
                <Text style={[styles.itemCount, { color: T.textSec }]}>{itemCount} item{itemCount === 1 ? '' : 's'}</Text>
              </View>
              <Text style={[styles.subtotal, { color: T.primary }]}>₦{subtotal.toLocaleString()}</Text>
              <Ionicons name="chevron-forward" size={18} color={T.textMuted} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  browseBtn:   { marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 4 },
  browseBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  card:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, padding: 14, borderWidth: 1 },
  vendorImg:   { width: 52, height: 52, borderRadius: 4, flexShrink: 0 },
  vendorName:  { fontSize: 15, fontWeight: '700' },
  itemCount:   { fontSize: 13, marginTop: 2 },
  subtotal:    { fontSize: 15, fontWeight: '800' },
});
