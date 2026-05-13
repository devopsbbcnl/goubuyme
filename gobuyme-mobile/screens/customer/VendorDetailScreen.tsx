import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';
import api from '@/services/api';

type VerificationBadge = 'UNVERIFIED' | 'ID_VERIFIED' | 'BUSINESS_VERIFIED' | 'PREMIUM_VERIFIED';

interface VendorDetail {
  id: string;
  businessName: string;
  description: string | null;
  category: string;
  logo: string | null;
  coverImage: string | null;
  isOpen: boolean;
  rating: number;
  totalRatings: number;
  city: string;
  state: string;
  openingTime: string | null;
  closingTime: string | null;
  avgDeliveryTime: number | null;
  verificationBadge: VerificationBadge;
}

const BADGE_META: Record<string, { label: string; color: string; icon: string }> = {
  ID_VERIFIED:       { label: 'ID Verified',       color: '#1A9E5F', icon: 'shield-checkmark' },
  BUSINESS_VERIFIED: { label: 'Business Verified', color: '#1A7FBF', icon: 'business' },
  PREMIUM_VERIFIED:  { label: 'Premium Verified',  color: '#C49A00', icon: 'star' },
};

interface DrinkOption {
  id: string;
  name: string;
  price: number;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  category: string | null;
  isFeatured: boolean;
  drinkOptions: DrinkOption[];
}

export default function VendorDetailScreen() {
  const { theme: T } = useTheme();
  const { addItem, getItems, getCount } = useCart();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'menu' | 'info'>('menu');
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [vendorRes, menuRes] = await Promise.all([
        api.get(`/vendors/${id}`),
        api.get(`/vendors/${id}/menu`),
      ]);
      setVendor(vendorRes.data.data);
      setMenuItems(menuRes.data.data ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const vendorItems = id ? getItems(id) : [];
  const vendorCount = id ? getCount(id) : 0;
  const getQty = (itemId: string) =>
    vendorItems.find(i => i.id === itemId)?.qty ?? 0;

  function formatHours(open: string | null, close: string | null): string {
    if (open && close) return `${open} – ${close}`;
    if (open) return `Opens at ${open}`;
    return 'Hours not listed';
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtnStandalone, { backgroundColor: T.surface }]}>
          <Ionicons name="chevron-back" size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      </View>
    );
  }

  if (error || !vendor) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtnStandalone, { backgroundColor: T.surface }]}>
          <Ionicons name="chevron-back" size={20} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 8 }}>Could not load restaurant</Text>
          <Text style={{ fontSize: 13, color: T.textSec, textAlign: 'center', marginBottom: 24 }}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={fetchData}
            style={[styles.retryBtn, { backgroundColor: T.primary, ...shadows.primaryGlow(T.primary) }]}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const deliveryLabel = vendor.avgDeliveryTime
    ? `${vendor.avgDeliveryTime}–${vendor.avgDeliveryTime + 10} min`
    : 'Varies';

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Cover image */}
        <View style={{ position: 'relative', height: 220 }}>
          {vendor.coverImage ? (
            <Image source={{ uri: vendor.coverImage }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 60 }}>🍽️</Text>
            </View>
          )}
          <View style={styles.coverGrad} />
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.heartBtn}>
            <Ionicons name="heart-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Store info */}
        <View style={[styles.infoBlock, { paddingTop: 16 }]}>
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vendorName, { color: T.text }]}>{vendor.businessName}</Text>
              <Text style={[styles.vendorCat, { color: T.textSec }]}>{vendor.category}</Text>
              {vendor.verificationBadge && vendor.verificationBadge !== 'UNVERIFIED' && (() => {
                const m = BADGE_META[vendor.verificationBadge];
                if (!m) return null;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: m.color + '18', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Ionicons name={m.icon as any} size={12} color={m.color} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: m.color, fontFamily: 'PlusJakartaSans_700Bold' }}>{m.label}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
            <View style={[styles.openBadge, { backgroundColor: vendor.isOpen ? 'rgba(26,158,95,0.15)' : 'rgba(226,59,59,0.15)' }]}>
              <Text style={[styles.openText, { color: vendor.isOpen ? T.success : T.error }]}>
                {vendor.isOpen ? '● Open' : '● Closed'}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color={T.star} />
              <Text style={[styles.metaVal, { color: T.text }]}>
                {vendor.rating.toFixed(1)} ({vendor.totalRatings})
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="flash-outline" size={14} color={T.textSec} />
              <Text style={[styles.metaValSec, { color: T.textSec }]}>{deliveryLabel}</Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabRow, { borderBottomColor: T.border }]}>
          {(['menu', 'info'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.tabBtn,
                activeTab === tab && { backgroundColor: T.primaryTint },
              ]}
            >
              <Text style={[styles.tabLabel, { color: activeTab === tab ? T.primary : T.textSec }]}>
                {tab === 'menu' ? 'Menu' : 'Info'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Menu items */}
        {activeTab === 'menu' && (
          <View style={{ padding: 20, gap: 12 }}>
            {menuItems.length === 0 ? (
              <View style={[styles.emptyMenu, { backgroundColor: T.surface, borderColor: T.border }]}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🍽️</Text>
                <Text style={[{ fontSize: 14, color: T.textSec }]}>No menu items available</Text>
              </View>
            ) : (
              menuItems.map(item => {
                const qty = getQty(item.id);
                return (
                  <View
                    key={item.id}
                    style={[styles.menuItem, { backgroundColor: T.surface, borderColor: T.border }]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => router.push({
                        pathname: '/menu-item',
                        params: {
                          id: item.id,
                          vendorId: id,
                          name: item.name,
                          description: item.description ?? '',
                          price: String(item.price),
                          image: item.image ?? '',
                          category: item.category ?? '',
                          isFeatured: item.isFeatured ? '1' : '0',
                          drinkOptions: JSON.stringify(item.drinkOptions ?? []),
                        },
                      })}
                      style={{ flexDirection: 'row', flex: 1 }}
                    >
                      {item.image ? (
                        <Image source={{ uri: item.image }} style={styles.menuImg} />
                      ) : (
                        <View style={[styles.menuImg, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="restaurant-outline" size={28} color={T.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1, padding: 12 }}>
                        <Text style={[styles.menuName, { color: T.text }]}>{item.name}</Text>
                        {item.description ? (
                          <Text style={[styles.menuDesc, { color: T.textSec }]} numberOfLines={2}>
                            {item.description}
                          </Text>
                        ) : null}
                        <Text style={[styles.menuPrice, { color: T.primary }]}>₦{item.price.toLocaleString()}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={{ paddingRight: 12, justifyContent: 'center' }}>
                      {qty === 0 ? (
                        <TouchableOpacity
                          onPress={() => addItem({ id: item.id, name: item.name, price: item.price, img: item.image ?? '' }, 1, id!)}
                          style={[styles.addBtn, { backgroundColor: T.primary }]}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            onPress={() => addItem({ id: item.id, name: item.name, price: item.price, img: item.image ?? '' }, -1, id!)}
                            style={[styles.stepBtn, { backgroundColor: T.surface3 }]}
                          >
                            <Ionicons name="remove" size={12} color={T.text} />
                          </TouchableOpacity>
                          <Text style={[styles.stepQty, { color: T.text }]}>{qty}</Text>
                          <TouchableOpacity
                            onPress={() => addItem({ id: item.id, name: item.name, price: item.price, img: item.image ?? '' }, 1, id!)}
                            style={[styles.stepBtn, { backgroundColor: T.primary }]}
                          >
                            <Ionicons name="add" size={12} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );

              })
            )}
          </View>
        )}

        {/* Info tab */}
        {activeTab === 'info' && (
          <View style={{ padding: 20, gap: 14 }}>
            {vendor.description ? (
              <View style={[styles.infoRow2, { borderBottomColor: T.border }]}>
                <Text style={[styles.infoLabel, { color: T.textSec }]}>About</Text>
                <Text style={[styles.infoValue, { color: T.text }]}>{vendor.description}</Text>
              </View>
            ) : null}
            {[
              { label: 'Location', value: `${vendor.city}, ${vendor.state}` },
              { label: 'Hours', value: formatHours(vendor.openingTime, vendor.closingTime) },
              { label: 'Avg Delivery', value: vendor.avgDeliveryTime ? `${vendor.avgDeliveryTime} min` : 'Varies' },
            ].map(row => (
              <View key={row.label} style={[styles.infoRow2, { borderBottomColor: T.border }]}>
                <Text style={[styles.infoLabel, { color: T.textSec }]}>{row.label}</Text>
                <Text style={[styles.infoValue, { color: T.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Cart CTA */}
      {vendorCount > 0 && (
        <View style={[styles.cartBar, { backgroundColor: T.surface, borderTopColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cartBarItems, { color: T.textSec }]}>{vendorCount} item{vendorCount > 1 ? 's' : ''} in cart</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/cart', params: { vendorId: id } })}
            style={[styles.cartBarBtn, { backgroundColor: T.primary, ...shadows.primaryGlow(T.primary) }]}
          >
            <Text style={styles.cartBarBtnText}>View Cart</Text>
            <Ionicons name="bag-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover:              { width: '100%', height: 220 },
  coverGrad:          { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  backBtn:            { position: 'absolute', top: 48, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  backBtnStandalone:  { position: 'absolute', top: 56, left: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  heartBtn:           { position: 'absolute', top: 48, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  infoBlock:          { paddingHorizontal: 20 },
  infoRow:            { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  vendorName:         { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  vendorCat:          { fontSize: 13, marginTop: 2 },
  openBadge:          { borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  openText:           { fontSize: 12, fontWeight: '700' },
  metaRow:            { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  metaItem:           { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaVal:            { fontSize: 12, fontWeight: '600' },
  metaValSec:         { fontSize: 12 },
  tabRow:             { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, borderBottomWidth: 1, gap: 8, marginTop: 8 },
  tabBtn:             { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 4 },
  tabLabel:           { fontSize: 14, fontWeight: '700' },
  emptyMenu:          { alignItems: 'center', paddingVertical: 40, borderRadius: 4, borderWidth: 1 },
  menuItem:           { flexDirection: 'row', borderRadius: 4, overflow: 'hidden', borderWidth: 1 },
  menuImg:            { width: 90, height: 90 },
  menuName:           { fontSize: 14, fontWeight: '700' },
  menuDesc:           { fontSize: 11, marginTop: 2, lineHeight: 16 },
  menuPrice:          { fontSize: 16, fontWeight: '800', marginTop: 6 },
  addBtn:             { width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepper:            { alignItems: 'center', gap: 8 },
  stepBtn:            { width: 28, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepQty:            { fontSize: 14, fontWeight: '700' },
  infoRow2:           { paddingBottom: 14, borderBottomWidth: 1 },
  infoLabel:          { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  infoValue:          { fontSize: 14, fontWeight: '500' },
  retryBtn:           { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 4 },
  cartBar:            { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 32, borderTopWidth: 1 },
  cartBarItems:       { fontSize: 13 },
  cartBarBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 4 },
  cartBarBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});
