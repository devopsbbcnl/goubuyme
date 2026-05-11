import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, Modal, Pressable,
  ActivityIndicator, RefreshControl, FlatList, Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROMO_CARD_WIDTH = SCREEN_WIDTH - 40;
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { useAddress } from '@/context/AddressContext';
import { BottomNav } from '@/components/layout/BottomNav';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesome } from '@expo/vector-icons';
import { radius, spacing, shadows } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import api from '@/services/api';

// Platform-default promo cards (shown when no vendor promos are live)
const PLATFORM_PROMOS = [
  { id: 'p1', tag: 'LIMITED TIME',  headline: 'Get 50% off\nyour first order!',        code: 'FIRST50',  bg: '#CC3D0E' },
  { id: 'p2', tag: 'FREE DELIVERY', headline: 'Free delivery on\norders over ₦5,000',  code: 'FREESHIP', bg: '#1A7F5A' },
  { id: 'p3', tag: 'WEEKEND DEAL',  headline: '20% off all\ngrocery orders',            code: 'WKEND20',  bg: '#5B3EC8' },
  { id: 'p4', tag: 'REFER A FRIEND',headline: 'Earn ₦1,000 credit\nfor every referral', code: 'REFER1K',  bg: '#0A6E8A' },
];

interface VendorPromo {
  id: string;
  title: string;
  imageUrl: string;
  code: string | null;
  vendor: { businessName: string };
}

type CarouselItem =
  | { kind: 'platform'; id: string; tag: string; headline: string; code: string; bg: string }
  | { kind: 'vendor';   id: string; title: string; imageUrl: string; code: string | null; vendorName: string };

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🍽️' },
  { id: 'food', label: 'Food', icon: '🍛' },
  { id: 'grocery', label: 'Grocery', icon: '🛒' },
  { id: 'pharmacy', label: 'Pharmacy', icon: '💊' },
  { id: 'errand', label: 'Errand', icon: '📦' },
];

type VerificationBadge = 'UNVERIFIED' | 'ID_VERIFIED' | 'BUSINESS_VERIFIED' | 'PREMIUM_VERIFIED';

interface Vendor {
  id: string;
  businessName: string;
  category: string;
  rating: number;
  totalRatings: number;
  logo: string | null;
  coverImage: string | null;
  isOpen: boolean;
  distanceKm: number | null;
  estimatedMinutes: number | null;
  minOrderPrice: number;
  verificationBadge: VerificationBadge;
}

const CAT_KEYWORDS: Record<string, string[]> = {
  food:     ['food', 'restaurant', 'kitchen', 'cuisine', 'meal', 'grill', 'suya', 'nigerian', 'fast'],
  grocery:  ['grocery', 'supermarket', 'market', 'store'],
  pharmacy: ['pharmacy', 'drug', 'chemist', 'health'],
  errand:   ['errand', 'delivery', 'logistics'],
};

function matchCat(vendorCat: string, selected: string): boolean {
  if (selected === 'all') return true;
  const lower = vendorCat.toLowerCase();
  return (CAT_KEYWORDS[selected] ?? [selected]).some(k => lower.includes(k));
}

function deriveTag(v: Vendor): string | null {
  if (v.rating >= 4.8 && v.totalRatings >= 5) return 'Top Rated';
  if (v.estimatedMinutes !== null && v.estimatedMinutes <= 20) return 'Fast';
  return null;
}

function formatTime(mins: number | null): string {
  if (mins === null) return 'Varies';
  return `${mins}–${mins + 10} min`;
}

const TYPE_ICONS: Record<string, any> = { home: 'home', work: 'business', other: 'location-on' };

const BADGE_META: Record<string, { label: string; color: string }> = {
  ID_VERIFIED:       { label: 'ID Verified',       color: '#1A9E5F' },
  BUSINESS_VERIFIED: { label: 'Biz Verified',      color: '#1A7FBF' },
  PREMIUM_VERIFIED:  { label: 'Premium',            color: '#C49A00' },
};

function VerifBadge({ badge }: { badge: string }) {
  const meta = BADGE_META[badge];
  if (!meta) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: meta.color + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
      <Ionicons name="shield-checkmark" size={10} color={meta.color} />
      <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color, fontFamily: 'PlusJakartaSans_700Bold' }}>{meta.label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { theme: T } = useTheme();
  const { count } = useCart();
  const { addresses, selected, selectAddress } = useAddress();
  const [activeCat,    setActiveCat]    = useState('all');
  const [addrModal,    setAddrModal]    = useState(false);
  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [activePromo,  setActivePromo]  = useState(0);
  const [vendorPromos, setVendorPromos] = useState<VendorPromo[]>([]);
  const promoRef = useRef<FlatList>(null);
  const isUserScrolling = useRef(false);

  const carouselItems: CarouselItem[] = vendorPromos.length > 0
    ? [
        ...vendorPromos.map(p => ({
          kind: 'vendor' as const,
          id: p.id, title: p.title, imageUrl: p.imageUrl,
          code: p.code, vendorName: p.vendor.businessName,
        })),
        ...PLATFORM_PROMOS.map(p => ({ kind: 'platform' as const, ...p })),
      ]
    : PLATFORM_PROMOS.map(p => ({ kind: 'platform' as const, ...p }));

  useEffect(() => {
    api.get('/vendors/active-promotions')
      .then(res => setVendorPromos(res.data.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isUserScrolling.current) return;
      setActivePromo(prev => {
        const next = (prev + 1) % carouselItems.length;
        promoRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(interval);
  }, [carouselItems.length]);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await api.get('/vendors');
      setVendors(res.data.data ?? []);
    } catch {
      // show whatever we have (or empty list)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVendors();
  }, [fetchVendors]);

  const hasAddresses = addresses.length > 0;
  const filtered = vendors.filter(v => matchCat(v.category, activeCat));

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.primary} colors={[T.primary]} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          {/* Deliver-to dropdown */}
          <TouchableOpacity
            onPress={() => hasAddresses && setAddrModal(true)}
            activeOpacity={hasAddresses ? 0.7 : 1}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={14} color={T.primary} />
              <Text style={[styles.locationLabel, { color: T.textSec }]}>Deliver to</Text>
              {hasAddresses && <Ionicons name="chevron-down" size={12} color={T.textSec} />}
            </View>
            {hasAddresses && selected ? (
              <Text style={[styles.locationCity, { color: T.text }]} numberOfLines={1}>
                {selected.label}
              </Text>
            ) : (
              <TouchableOpacity onPress={() => router.push('/saved-addresses')} activeOpacity={0.75}>
                <Text style={[styles.locationCity, { color: T.textMuted, fontSize: 13 }]}>
                  No saved addresses
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/cart')} style={[styles.cartBtn, { backgroundColor: T.surface }]}>
            <Ionicons name="cart-outline" size={20} color={T.text} />
            {count > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: T.primary }]}>
                <Text style={styles.cartBadgeText}>{count}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search bar + filter */}
        <View style={styles.searchRow}>
          <TouchableOpacity onPress={() => router.push('/search')} activeOpacity={0.8} style={[styles.searchBar, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Ionicons name="search-outline" size={18} color={T.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: T.textMuted }]}>Search for food or restaurant...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterBtn, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Ionicons name="options-outline" size={20} color={T.text} />
          </TouchableOpacity>
        </View>

        {/* Promo carousel */}
        <FlatList
          ref={promoRef}
          data={carouselItems}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={{ marginBottom: 10 }}
          onScrollBeginDrag={() => { isUserScrolling.current = true; }}
          onMomentumScrollEnd={e => {
            const index = Math.round(e.nativeEvent.contentOffset.x / PROMO_CARD_WIDTH);
            setActivePromo(index);
            isUserScrolling.current = false;
          }}
          renderItem={({ item }) => {
            if (item.kind === 'vendor') {
              return (
                <View style={[styles.promoBanner, { width: PROMO_CARD_WIDTH, padding: 0, overflow: 'hidden' }]}>
                  <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  {item.code && (
                    <View style={[styles.promoCode, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                      <Text style={styles.promoCodeText}>Use: {item.code}</Text>
                    </View>
                  )}
                </View>
              );
            }
            return (
              <View style={[styles.promoBanner, { backgroundColor: item.bg, width: PROMO_CARD_WIDTH }]}>
                <Text style={styles.promoTag}>{item.tag}</Text>
                <Text style={styles.promoHeadline}>{item.headline}</Text>
                <View style={[styles.promoCode, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={styles.promoCodeText}>Use: {item.code}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Promo dot indicators */}
        <View style={styles.promoDots}>
          {carouselItems.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                promoRef.current?.scrollToIndex({ index: i, animated: true });
                setActivePromo(i);
              }}
              style={[
                styles.promoDot,
                i === activePromo
                  ? { backgroundColor: T.primary, width: 20 }
                  : { backgroundColor: T.border },
              ]}
            />
          ))}
        </View>

        {/* Categories */}
        <Text style={[styles.sectionTitle, { color: T.text }]}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setActiveCat(c.id)}
              style={[
                styles.catChip,
                { backgroundColor: activeCat === c.id ? T.primary : T.surface, borderColor: T.border,
                  borderWidth: activeCat === c.id ? 0 : 1 },
              ]}
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={[styles.catLabel, { color: activeCat === c.id ? '#fff' : T.textSec }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Vendors */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={[styles.sectionTitle, { color: T.text, marginBottom: 0 }]}>Nearby Restaurants</Text>
          <TouchableOpacity onPress={() => router.push('/search')}>
            <Text style={{ fontSize: 13, color: T.primary, fontWeight: '600' }}>See All</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={T.primary} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🍽️</Text>
            <Text style={[styles.emptyText, { color: T.textSec }]}>
              {activeCat === 'all' ? 'No restaurants available yet' : 'No restaurants in this category'}
            </Text>
          </View>
        ) : (
          filtered.map(v => {
            const tag = deriveTag(v);
            return (
              <TouchableOpacity
                key={v.id}
                onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: v.id } })}
                activeOpacity={0.9}
                style={[styles.vendorCard, { backgroundColor: T.surface, borderColor: T.border, ...shadows.card }]}
              >
                <View style={{ position: 'relative' }}>
                  {v.coverImage ? (
                    <Image source={{ uri: v.coverImage }} style={styles.vendorImage} />
                  ) : (
                    <View style={[styles.vendorImage, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 40 }}>🍽️</Text>
                    </View>
                  )}
                  {tag && (
                    <View style={[styles.vendorTag, { backgroundColor: T.primary }]}>
                      <Text style={styles.vendorTagText}>{tag}</Text>
                    </View>
                  )}
                  {!v.isOpen && (
                    <View style={styles.closedOverlay}>
                      <Text style={styles.closedText}>Closed</Text>
                    </View>
                  )}
                  <View style={[styles.arrowBtn, { backgroundColor: T.primary }]}>
                    <FontAwesome name="angle-right" size={18} color="#fff" />
                  </View>
                </View>
                <View style={styles.vendorInfo}>
                  {v.logo ? (
                    <Image source={{ uri: v.logo }} style={[styles.vendorLogo, { borderColor: T.border }]} />
                  ) : (
                    <View style={[styles.vendorLogo, { backgroundColor: T.primaryTint, borderColor: T.border, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 20 }}>🍽️</Text>
                    </View>
                  )}
                  <View style={styles.vendorText}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[styles.vendorName, { color: T.text }]}>{v.businessName}</Text>
                      {v.verificationBadge !== 'UNVERIFIED' && (
                        <VerifBadge badge={v.verificationBadge} />
                      )}
                    </View>
                    <Text style={[styles.vendorCat, { color: T.textSec }]}>{v.category}</Text>
                    <View style={styles.vendorMeta}>
                      <Text style={[styles.metaText, { color: T.text }]}>⭐ {v.rating.toFixed(1)}</Text>
                      <View style={[styles.metaDot, { backgroundColor: T.border }]} />
                      <Text style={[styles.metaText, { color: T.textSec }]}>⚡ {formatTime(v.estimatedMinutes)}</Text>
                      {v.minOrderPrice > 0 && (
                        <>
                          <View style={[styles.metaDot, { backgroundColor: T.border }]} />
                          <Text style={[styles.metaText, { color: T.textSec }]}>Min ₦{v.minOrderPrice.toLocaleString()}</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <BottomNav active="home" onPress={(tab) => {
        if (tab === 'orders') router.push('/orders');
        if (tab === 'favorites') router.push('/favorites');
        if (tab === 'profile') router.push('/profile');
      }} />

      {/* Address picker modal */}
      <Modal visible={addrModal} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setAddrModal(false)} />
        <View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: T.text }]}>Deliver to</Text>

          {addresses.map(addr => {
            const isActive = addr.id === selected?.id;
            return (
              <TouchableOpacity
                key={addr.id}
                onPress={() => { selectAddress(addr.id); setAddrModal(false); }}
                activeOpacity={0.75}
                style={[
                  styles.addrRow,
                  { borderColor: isActive ? T.primary : T.border,
                    backgroundColor: isActive ? T.primaryTint : T.surface2 },
                ]}
              >
                <View style={[styles.addrIconWrap, { backgroundColor: isActive ? T.primary : T.surface3 }]}>
                  <MaterialIcons name={TYPE_ICONS[addr.type]} size={18} color={isActive ? '#fff' : T.textSec} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.addrLabel, { color: T.text }]}>{addr.label}</Text>
                  <Text style={[styles.addrText, { color: T.textSec }]} numberOfLines={1}>{addr.address}</Text>
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={20} color={T.primary} />}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            onPress={() => { setAddrModal(false); router.push('/saved-addresses'); }}
            style={[styles.manageBtn, { borderColor: T.border }]}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={18} color={T.primary} />
            <Text style={[styles.manageBtnText, { color: T.primary }]}>Manage Addresses</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:            { padding: 20, paddingBottom: 100 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  locationLabel:     { fontSize: 12, fontWeight: '500' },
  locationCity:      { fontSize: 16, fontWeight: '700', marginTop: 1, maxWidth: 220 },
  cartBtn:           { width: 40, height: 40, borderRadius: 4, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cartBadge:         { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText:     { fontSize: 10, fontWeight: '700', color: '#fff' },
  searchRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  searchBar:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 4, padding: 12 },
  filterBtn:         { width: 46, height: 46, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchPlaceholder: { fontSize: 14 },
  promoBanner:       { borderRadius: 4, height: 180, padding: 20, justifyContent: 'center' },
  promoTag:          { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginBottom: 4 },
  promoHeadline:     { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 28 },
  promoCode:         { position: 'absolute', bottom: 16, right: 16, borderRadius: 4, padding: 6 },
  promoCodeText:     { fontSize: 12, fontWeight: '700', color: '#fff' },
  promoDots:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 20 },
  promoDot:          { height: 6, borderRadius: 3 },
  sectionTitle:      { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  categories:        { marginBottom: 20 },
  catChip:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, marginRight: 8 },
  catIcon:           { fontSize: 15 },
  catLabel:          { fontSize: 13, fontWeight: '600' },
  emptyState:        { alignItems: 'center', paddingVertical: 40, borderRadius: 4, borderWidth: 1, marginBottom: 14 },
  emptyText:         { fontSize: 14, textAlign: 'center' },
  vendorCard:        { borderRadius: 4, overflow: 'hidden', borderWidth: 1, marginBottom: 14 },
  vendorImage:       { width: '100%', height: 150 },
  vendorTag:         { position: 'absolute', top: 12, left: 12, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  vendorTagText:     { fontSize: 11, fontWeight: '700', color: '#fff' },
  closedOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  closedText:        { fontSize: 14, fontWeight: '700', color: '#fff' },
  arrowBtn:          { position: 'absolute', bottom: 12, right: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  vendorInfo:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  vendorLogo:        { width: 50, height: 50, borderRadius: 4, borderWidth: 1, flexShrink: 0 },
  vendorText:        { flex: 1 },
  vendorName:        { fontSize: 15, fontWeight: '700' },
  vendorCat:         { fontSize: 12, marginTop: 2 },
  vendorMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  metaText:          { fontSize: 12, fontWeight: '600' },
  metaDot:           { width: 3, height: 3, borderRadius: 2 },
  // Modal
  modalBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 10 },
  modalHandle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 8 },
  modalTitle:        { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  addrRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 4, borderWidth: 1.5 },
  addrIconWrap:      { width: 36, height: 36, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  addrLabel:         { fontSize: 14, fontWeight: '700' },
  addrText:          { fontSize: 12, marginTop: 2 },
  manageBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 4 },
  manageBtnText:     { fontSize: 14, fontWeight: '600' },
});
