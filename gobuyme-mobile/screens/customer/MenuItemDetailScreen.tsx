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

interface OptionItem {
  id: string;
  name: string;
  extraPrice: number;
  isAvailable: boolean;
}

interface OptionGroup {
  id: string;
  name: string;
  required: boolean;
  items: OptionItem[];
}

export default function MenuItemDetailScreen() {
  const { theme: T } = useTheme();
  const { replaceItem, getItems } = useCart();
  const params = useLocalSearchParams<{
    id: string;
    vendorId: string;
    vendorName: string;
    vendorImage: string;
    name: string;
    description: string;
    price: string;
    image: string;
    category: string;
    isFeatured: string;
    stockQuantity: string;
    drinkOptions: string;
    optionGroups: string;
    vendorOpen: string;
  }>();

  const vendorId = params.vendorId ?? '';
  const vendorName = params.vendorName ?? '';
  const vendorImage = params.vendorImage ?? undefined;
  const isVendorOpen = params.vendorOpen === '1';
  const item = {
    id:          params.id ?? '',
    name:        params.name ?? '',
    description: params.description ?? '',
    price:       Number(params.price ?? 0),
    image:       params.image ?? '',
    category:    params.category ?? '',
    isFeatured:  params.isFeatured === '1',
    stockQuantity: Number(params.stockQuantity ?? 0),
  };

  const drinkOptions: DrinkOption[] = (() => {
    try { return JSON.parse(params.drinkOptions ?? '[]'); } catch { return []; }
  })();

  const optionGroups: OptionGroup[] = (() => {
    try { return JSON.parse(params.optionGroups ?? '[]'); } catch { return []; }
  })();

  const cartQty = getItems(vendorId).find(i => i.id === item.id)?.qty ?? 0;
  const [localQty, setLocalQty] = useState(Math.min(Math.max(cartQty, 0), item.stockQuantity));
  // drink id → quantity selected
  const [drinkSelections, setDrinkSelections] = useState<Record<string, number>>({});
  // groupId → itemId → quantity selected (extras can be added more than once, per item)
  const [optionSelections, setOptionSelections] = useState<Record<string, Record<string, number>>>({});

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

  const changeOptionQty = (groupId: string, itemId: string, delta: number) => {
    setOptionSelections(prev => {
      const next = Math.max(0, (prev[groupId]?.[itemId] ?? 0) + delta);
      return { ...prev, [groupId]: { ...prev[groupId], [itemId]: next } };
    });
  };

  const drinkSubtotal = Object.entries(drinkSelections).reduce((sum, [id, qty]) => {
    const drink = drinkOptions.find(d => d.id === id);
    return sum + (drink?.price ?? 0) * qty;
  }, 0);

  const optionSubtotal = optionGroups.reduce((sum, group) =>
    sum + group.items.reduce((s2, i2) => s2 + (optionSelections[group.id]?.[i2.id] ?? 0) * i2.extraPrice, 0), 0);

  const unitPrice = item.price + drinkSubtotal + optionSubtotal;
  const totalPrice = unitPrice * Math.max(localQty, 1);

  const handleConfirm = () => {
    if (!isVendorOpen) return;

    const drinkSelectionEntries = Object.entries(drinkSelections)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const drink = drinkOptions.find(d => d.id === id);
        return {
          label: qty > 1 ? `${drink?.name} ×${qty}` : drink?.name ?? '',
          price: (drink?.price ?? 0) * qty,
        };
      });
    const optionSelectionEntries = optionGroups.flatMap(group =>
      group.items
        .filter(i2 => (optionSelections[group.id]?.[i2.id] ?? 0) > 0)
        .map(i2 => {
          const qty = optionSelections[group.id][i2.id];
          return {
            label: qty > 1 ? `${i2.name} ×${qty}` : i2.name,
            price: i2.extraPrice * qty,
          };
        }));
    const selections = [...drinkSelectionEntries, ...optionSelectionEntries].filter(s => s.label);
    const allLabels = selections.map(s => s.label);
    const cartName = allLabels.length > 0
      ? `${item.name} + ${allLabels.join(', ')}`
      : item.name;

    replaceItem(
      { id: item.id, name: cartName, price: unitPrice, img: item.image, selections },
      localQty > 0 ? localQty : 0,
      { id: vendorId, name: vendorName, image: vendorImage },
    );
    router.back();
  };

  const hasDrinks = drinkOptions.length > 0;
  const hasAnyDrink = drinkSubtotal > 0;
  const hasOptions = optionGroups.length > 0;
  const hasAnyOption = optionSubtotal > 0;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, opacity: isVendorOpen ? 1 : 0.5 }}>
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
            {(hasAnyDrink || hasAnyOption) ? (
              <Text style={[styles.priceBreakdown, { color: T.textSec }]}>
                {'  '}(₦{item.price.toLocaleString()} food
                {hasAnyDrink && ` + ₦${drinkSubtotal.toLocaleString()} drinks`}
                {hasAnyOption && ` + ₦${optionSubtotal.toLocaleString()} extras`}
                )
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
              <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Add a Drink</Text>
              <Text style={[styles.drinkHint, { color: T.textMuted }]}>Optional — add any, in any quantity</Text>

              <View style={styles.extrasGrid}>
                {drinkOptions.map(drink => {
                  const qty = drinkSelections[drink.id] ?? 0;
                  return (
                    <View
                      key={drink.id}
                      style={[
                        styles.extraCard,
                        { borderColor: qty > 0 ? T.primary : T.border, backgroundColor: qty > 0 ? T.primaryTint : T.surface },
                      ]}
                    >
                      <Text style={[styles.drinkName, { color: T.text }]} numberOfLines={2}>{drink.name}</Text>
                      <Text style={[styles.drinkPrice, { color: T.primary, marginBottom: 10 }]}>+₦{drink.price.toLocaleString()}</Text>
                      <View style={styles.extraStepper}>
                        <TouchableOpacity
                          onPress={() => changeDrinkQty(drink.id, -1)}
                          style={[styles.extraStepBtn, { borderColor: T.border, backgroundColor: T.surface }]}
                          disabled={qty === 0 || !isVendorOpen}
                        >
                          <Ionicons name="remove" size={14} color={qty > 0 && isVendorOpen ? T.text : T.textMuted} />
                        </TouchableOpacity>
                        <Text style={[styles.extraStepQty, { color: T.text }]}>{qty}</Text>
                        <TouchableOpacity
                          onPress={() => changeDrinkQty(drink.id, 1)}
                          style={[styles.extraStepBtn, styles.extraStepBtnAdd, { backgroundColor: isVendorOpen ? T.primary : T.surface3 }]}
                          disabled={!isVendorOpen}
                        >
                          <Ionicons name="add" size={14} color={isVendorOpen ? '#fff' : T.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Option groups (extras) */}
          {hasOptions && (
            <>
              <View style={[styles.divider, { backgroundColor: T.border }]} />
              {optionGroups.map(group => (
                <View key={group.id} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text style={[styles.sectionLabel, { color: T.textMuted, marginBottom: 0 }]}>{group.name}</Text>
                    {group.required && (
                      <View style={[styles.requiredPill, { backgroundColor: `${T.primary}18` }]}>
                        <Text style={[styles.requiredPillText, { color: T.primary }]}>Required</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.drinkHint, { color: T.textMuted }]}>
                    {group.required ? 'Select at least one — add extra quantity if you like' : 'Optional — add any, in any quantity'}
                  </Text>

                  <View style={styles.extrasGrid}>
                    {group.items.filter(i2 => i2.isAvailable).map(i2 => {
                      const qty = optionSelections[group.id]?.[i2.id] ?? 0;
                      return (
                        <View
                          key={i2.id}
                          style={[
                            styles.extraCard,
                            { borderColor: qty > 0 ? T.primary : T.border, backgroundColor: qty > 0 ? T.primaryTint : T.surface },
                          ]}
                        >
                          <Text style={[styles.drinkName, { color: T.text }]} numberOfLines={2}>{i2.name}</Text>
                          {i2.extraPrice > 0 ? (
                            <Text style={[styles.drinkPrice, { color: T.primary, marginBottom: 10 }]}>+₦{i2.extraPrice.toLocaleString()}</Text>
                          ) : (
                            <Text style={[styles.drinkPrice, { color: T.textMuted, marginBottom: 10 }]}>Free</Text>
                          )}
                          <View style={styles.extraStepper}>
                            <TouchableOpacity
                              onPress={() => changeOptionQty(group.id, i2.id, -1)}
                              style={[styles.extraStepBtn, { borderColor: T.border, backgroundColor: T.surface }]}
                              disabled={qty === 0 || !isVendorOpen}
                            >
                              <Ionicons name="remove" size={14} color={qty > 0 && isVendorOpen ? T.text : T.textMuted} />
                            </TouchableOpacity>
                            <Text style={[styles.extraStepQty, { color: T.text }]}>{qty}</Text>
                            <TouchableOpacity
                              onPress={() => changeOptionQty(group.id, i2.id, 1)}
                              style={[styles.extraStepBtn, styles.extraStepBtnAdd, { backgroundColor: isVendorOpen ? T.primary : T.surface3 }]}
                              disabled={!isVendorOpen}
                            >
                              <Ionicons name="add" size={14} color={isVendorOpen ? '#fff' : T.textMuted} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </>
          )}

          <View style={[styles.divider, { backgroundColor: T.border }]} />

          {/* Quantity */}
          <Text style={[styles.sectionLabel, { color: T.textMuted }]}>Quantity</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => setLocalQty(q => Math.max(0, q - 1))}
              style={[styles.stepBtn, { backgroundColor: localQty > 0 ? T.surface3 : T.surface2 }]}
              disabled={localQty === 0 || !isVendorOpen}
            >
              <Ionicons name="remove" size={18} color={localQty > 0 && isVendorOpen ? T.text : T.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.stepQty, { color: T.text }]}>{localQty}</Text>

            <TouchableOpacity
              onPress={() => setLocalQty(q => Math.min(item.stockQuantity, q + 1))}
              style={[styles.stepBtn, { backgroundColor: localQty >= item.stockQuantity || !isVendorOpen ? T.surface3 : T.primary }]}
              disabled={localQty >= item.stockQuantity || !isVendorOpen}
            >
              <Ionicons name="add" size={18} color={localQty >= item.stockQuantity || !isVendorOpen ? T.textMuted : '#fff'} />
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
          style={[styles.ctaBtn, { backgroundColor: localQty === 0 || !isVendorOpen ? T.surface3 : T.primary, ...(localQty > 0 && isVendorOpen ? shadows.primaryGlow(T.primary) : {}) }]}
          disabled={!isVendorOpen}
        >
          <Ionicons name={!isVendorOpen ? 'lock-closed-outline' : localQty === 0 ? 'close-outline' : 'bag-add-outline'} size={18} color={localQty === 0 || !isVendorOpen ? T.textSec : '#fff'} />
          <Text style={[styles.ctaBtnText, { color: localQty === 0 || !isVendorOpen ? T.textSec : '#fff' }]}>
            {!isVendorOpen ? 'Restaurant Closed' : localQty === 0 ? 'Cancel' : `Add ${localQty} to Cart`}
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
  drinkName:        { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  drinkPrice:       { fontSize: 12, fontWeight: '700', marginTop: 2 },
  extrasGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  extraCard:        { width: '31%', minWidth: 100, flexGrow: 1, borderRadius: 4, borderWidth: 1, padding: 10 },
  extraStepper:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  extraStepBtn:     { width: 28, height: 28, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  extraStepBtnAdd:  { borderWidth: 0 },
  extraStepQty:     { fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  requiredPill:     { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  requiredPillText: { fontSize: 10, fontWeight: '700' },
  stepperRow:       { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 4 },
  stepBtn:          { width: 44, height: 44, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepQty:          { fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  bottomBar:        { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, borderTopWidth: 1 },
  totalLabel:       { fontSize: 13 },
  ctaBtn:           { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 4 },
  ctaBtnText:       { fontSize: 15, fontWeight: '700' },
});
