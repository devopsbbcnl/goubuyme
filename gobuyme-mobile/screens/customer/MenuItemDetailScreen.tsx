import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useCart } from '@/context/CartContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';

interface DrinkOption {
  id: string;
  name: string;
  price: number;
}

export default function MenuItemDetailScreen() {
  const { theme: T } = useTheme();
  const { replaceItem, getItems } = useCart();
  const params = useLocalSearchParams<{
    id: string;
    vendorId: string;
    name: string;
    description: string;
    price: string;
    image: string;
    category: string;
    isFeatured: string;
    drinkOptions: string;
  }>();

  const vendorId = params.vendorId ?? '';
  const item = {
    id:          params.id ?? '',
    name:        params.name ?? '',
    description: params.description ?? '',
    price:       Number(params.price ?? 0),
    image:       params.image ?? '',
    category:    params.category ?? '',
    isFeatured:  params.isFeatured === '1',
  };

  const drinkOptions: DrinkOption[] = (() => {
    try { return JSON.parse(params.drinkOptions ?? '[]'); } catch { return []; }
  })();

  const cartQty = getItems(vendorId).find(i => i.id === item.id)?.qty ?? 0;
  const [localQty, setLocalQty] = useState(Math.max(cartQty, 0));
  // drink id → quantity selected
  const [drinkSelections, setDrinkSelections] = useState<Record<string, number>>({});

  const toggleDrink = (id: string) => {
    setDrinkSelections(prev => {
      if (prev[id]) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: 1 };
    });
  };

  const changeDrinkQty = (id: string, delta: number) => {
    setDrinkSelections(prev => {
      const next = (prev[id] ?? 0) + delta;
      if (next <= 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const drinkSubtotal = Object.entries(drinkSelections).reduce((sum, [id, qty]) => {
    const drink = drinkOptions.find(d => d.id === id);
    return sum + (drink?.price ?? 0) * qty;
  }, 0);

  const unitPrice = item.price + drinkSubtotal;
  const totalPrice = unitPrice * Math.max(localQty, 1);

  const handleConfirm = () => {
    const selectedDrinkLabels = Object.entries(drinkSelections)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const drink = drinkOptions.find(d => d.id === id);
        return qty > 1 ? `${drink?.name} ×${qty}` : drink?.name ?? '';
      });
    const cartName = selectedDrinkLabels.length > 0
      ? `${item.name} + ${selectedDrinkLabels.join(', ')}`
      : item.name;

    replaceItem({ id: item.id, name: cartName, price: unitPrice, img: item.image }, localQty > 0 ? localQty : 0, vendorId);
    router.back();
  };

  const hasDrinks = drinkOptions.length > 0;
  const hasAnyDrink = drinkSubtotal > 0;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>

        {/* Hero image */}
        <View style={{ position: 'relative', height: 300 }}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.hero} resizeMode="cover" />
          ) : (
            <View style={[styles.hero, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="restaurant-outline" size={80} color={T.textMuted} />
            </View>
          )}
          <View style={styles.heroGrad} />
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>

          {/* Badges */}
          <View style={styles.badgeRow}>
            {item.category ? (
              <View style={[styles.categoryBadge, { backgroundColor: T.surface2, borderColor: T.border }]}>
                <Text style={[styles.categoryText, { color: T.textSec }]}>{item.category}</Text>
              </View>
            ) : null}
            {item.isFeatured && (
              <View style={[styles.featuredBadge, { backgroundColor: T.primary + '18' }]}>
                <Ionicons name="star" size={11} color={T.primary} />
                <Text style={[styles.featuredText, { color: T.primary }]}>Featured</Text>
              </View>
            )}
          </View>

          {/* Name */}
          <Text style={[styles.name, { color: T.text }]}>{item.name}</Text>

          {/* Price */}
          <Text style={[styles.price, { color: T.primary }]}>
            ₦{unitPrice.toLocaleString()}
            {hasAnyDrink ? (
              <Text style={[styles.priceBreakdown, { color: T.textSec }]}>
                {'  '}(₦{item.price.toLocaleString()} food + ₦{drinkSubtotal.toLocaleString()} drinks)
              </Text>
            ) : null}
          </Text>

          <View style={[styles.divider, { backgroundColor: T.border }]} />

          {/* Description */}
          <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Description</Text>
          {item.description ? (
            <Text style={[styles.description, { color: T.textSec }]}>{item.description}</Text>
          ) : (
            <Text style={[styles.description, { color: T.textMuted, fontStyle: 'italic' }]}>No description available.</Text>
          )}

          {/* Drink options */}
          {hasDrinks && (
            <>
              <View style={[styles.divider, { backgroundColor: T.border }]} />
              <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Add Drinks</Text>
              <Text style={[styles.drinkHint, { color: T.textMuted }]}>Optional — pick any, in any quantity</Text>

              {drinkOptions.map(drink => {
                const qty = drinkSelections[drink.id] ?? 0;
                const selected = qty > 0;
                return (
                  <View
                    key={drink.id}
                    style={[
                      styles.drinkOption,
                      { borderColor: selected ? T.primary : T.border, backgroundColor: selected ? T.primaryTint : T.surface },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => toggleDrink(drink.id)}
                      style={styles.drinkOptionMain}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.checkbox, { borderColor: selected ? T.primary : T.border, backgroundColor: selected ? T.primary : 'transparent' }]}>
                        {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <Text style={[styles.drinkName, { color: T.text, flex: 1 }]}>{drink.name}</Text>
                      <Text style={[styles.drinkPrice, { color: T.primary }]}>+₦{drink.price.toLocaleString()}</Text>
                    </TouchableOpacity>

                    {selected && (
                      <View style={[styles.drinkStepper, { borderTopColor: T.border }]}>
                        <TouchableOpacity
                          onPress={() => changeDrinkQty(drink.id, -1)}
                          style={[styles.drinkStepBtn, { backgroundColor: T.surface3 }]}
                        >
                          <Ionicons name="remove" size={14} color={T.text} />
                        </TouchableOpacity>
                        <Text style={[styles.drinkStepQty, { color: T.text }]}>{qty}</Text>
                        <TouchableOpacity
                          onPress={() => changeDrinkQty(drink.id, 1)}
                          style={[styles.drinkStepBtn, { backgroundColor: T.primary }]}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          <View style={[styles.divider, { backgroundColor: T.border }]} />

          {/* Quantity */}
          <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Quantity</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => setLocalQty(q => Math.max(0, q - 1))}
              style={[styles.stepBtn, { backgroundColor: localQty > 0 ? T.surface3 : T.surface2 }]}
              disabled={localQty === 0}
            >
              <Ionicons name="remove" size={18} color={localQty > 0 ? T.text : T.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.stepQty, { color: T.text }]}>{localQty}</Text>

            <TouchableOpacity
              onPress={() => setLocalQty(q => q + 1)}
              style={[styles.stepBtn, { backgroundColor: T.primary }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={[styles.bottomBar, { backgroundColor: T.surface, borderTopColor: T.border }]}>
        <View style={{ flex: 1 }}>
          {localQty > 0 && (
            <Text style={[styles.totalLabel, { color: T.textSec }]}>
              {localQty} × ₦{unitPrice.toLocaleString()} ={' '}
              <Text style={{ color: T.text, fontWeight: '800' }}>₦{totalPrice.toLocaleString()}</Text>
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleConfirm}
          style={[styles.ctaBtn, { backgroundColor: localQty === 0 ? T.surface3 : T.primary, ...(localQty > 0 ? shadows.primaryGlow(T.primary) : {}) }]}
        >
          <Ionicons name={localQty === 0 ? 'close-outline' : 'bag-add-outline'} size={18} color={localQty === 0 ? T.textSec : '#fff'} />
          <Text style={[styles.ctaBtnText, { color: localQty === 0 ? T.textSec : '#fff' }]}>
            {localQty === 0 ? 'Cancel' : `Add ${localQty} to Cart`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero:             { width: '100%', height: 300 },
  heroGrad:         { ...StyleSheet.absoluteFillObject, height: 300, backgroundColor: 'rgba(0,0,0,0.20)' },
  backBtn:          { position: 'absolute', top: 48, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  content:          { padding: 20, gap: 4 },
  badgeRow:         { flexDirection: 'row', gap: 8, marginBottom: 8 },
  categoryBadge:    { borderRadius: 4, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  featuredBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 },
  featuredText:     { fontSize: 11, fontWeight: '700' },
  name:             { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, lineHeight: 32, marginTop: 4 },
  price:            { fontSize: 24, fontWeight: '800', marginTop: 6 },
  priceBreakdown:   { fontSize: 13, fontWeight: '400' },
  divider:          { height: 1, marginVertical: 20 },
  sectionLabel:     { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  description:      { fontSize: 15, lineHeight: 24, fontWeight: '400' },
  drinkHint:        { fontSize: 12, marginBottom: 10 },
  drinkOption:      { borderRadius: 4, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  drinkOptionMain:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  checkbox:         { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  drinkName:        { fontSize: 14, fontWeight: '600' },
  drinkPrice:       { fontSize: 14, fontWeight: '700' },
  drinkStepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  drinkStepBtn:     { width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  drinkStepQty:     { fontSize: 15, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  stepperRow:       { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 4 },
  stepBtn:          { width: 44, height: 44, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepQty:          { fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  bottomBar:        { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, borderTopWidth: 1 },
  totalLabel:       { fontSize: 13 },
  ctaBtn:           { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 4 },
  ctaBtnText:       { fontSize: 15, fontWeight: '700' },
});
