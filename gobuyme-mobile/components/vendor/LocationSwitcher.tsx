import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useVendorLocations, VendorLocation } from '@/hooks/useVendorLocations';

/**
 * Shows the location being managed and lets a multi-location vendor switch. Renders nothing extra
 * for single-location vendors (just the name), so existing vendors see no change.
 */
export function LocationSwitcher({ fallbackName }: { fallbackName?: string }) {
  const { theme: T } = useTheme();
  const { locations, active, switchTo, refresh } = useVendorLocations();
  // Pick up branches added or removed on the Locations screen.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const [open, setOpen] = useState(false);

  const name = active?.businessName ?? fallbackName ?? '';
  if (locations.length < 2) {
    return <Text style={[styles.name, { color: T.text }]} numberOfLines={1}>{name}</Text>;
  }

  const pick = (loc: VendorLocation) => {
    setOpen(false);
    switchTo(loc);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={`Managing ${name}. Switch location`}
      >
        <Text style={[styles.name, { color: T.text, flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
        <Ionicons name="chevron-down" size={18} color={T.primary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]} onPress={() => {}}>
            <Text style={[styles.title, { color: T.text }]}>Switch location</Text>
            <Text style={[styles.sub, { color: T.textSec }]}>
              Each location has its own menu, stock, hours and orders.
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {locations.map((l) => {
                const selected = l.id === active?.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    onPress={() => pick(l)}
                    activeOpacity={0.8}
                    style={[
                      styles.row,
                      { borderColor: selected ? T.primary : T.border, backgroundColor: selected ? T.primaryTint : 'transparent' },
                    ]}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? T.primary : T.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: T.text }]} numberOfLines={1}>
                        {l.isMain ? `${l.businessName} (main)` : l.businessName}
                      </Text>
                      <Text style={[styles.rowSub, { color: T.textSec }]} numberOfLines={1}>
                        {l.address}, {l.city}
                      </Text>
                      {l.approvalStatus !== 'APPROVED' && (
                        <Text style={[styles.rowSub, { color: T.warning }]}>
                          {l.approvalStatus === 'PENDING' ? 'Waiting for approval' : l.approvalStatus.toLowerCase()}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.dot, { backgroundColor: l.isOpen ? T.success : T.textMuted }]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240 },
  name: { fontSize: 18, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 4, borderWidth: 1, padding: 18 },
  title: { fontSize: 17, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
  sub: { fontSize: 12, marginTop: 4, marginBottom: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 4, padding: 12, marginBottom: 8 },
  rowName: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  rowSub: { fontSize: 12, marginTop: 1, fontFamily: 'PlusJakartaSans_400Regular' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
