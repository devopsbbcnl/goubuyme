import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  Alert, Modal, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@gobuyme.shop';
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || '+2347078901095';
const WEBSITE_URL = process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://gobuyme.shop';

const PREF_KEY = 'customerSettingsPrefs';

type PrefKey = 'language' | 'deliveryCity' | 'currency';
type Prefs = Record<PrefKey, string>;

const DEFAULT_PREFS: Prefs = {
  language: 'English (Nigeria)',
  deliveryCity: 'Port Harcourt',
  currency: 'Nigerian Naira (NGN)',
};

const OPTIONS: Record<PrefKey, string[]> = {
  language: ['English (Nigeria)', 'English (United States)', 'Igbo', 'Yoruba', 'Hausa'],
  deliveryCity: ['Port Harcourt', 'Owerri', 'Lagos', 'Abuja'],
  currency: ['Nigerian Naira (NGN)'],
};

const MODAL_TITLE: Record<PrefKey, string> = {
  language: 'Language',
  deliveryCity: 'Default Delivery City',
  currency: 'Currency',
};

export default function SettingsScreen() {
  const { theme: T, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [modalKey, setModalKey] = useState<PrefKey | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY)
      .then(raw => {
        if (!raw) return;
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      })
      .catch(() => {});
  }, []);

  const updatePref = async (key: PrefKey, value: string) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setModalKey(null);
    await AsyncStorage.setItem(PREF_KEY, JSON.stringify(next));
  };

  const openUrl = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Cannot open link', url);
      return;
    }
    await Linking.openURL(url);
  };

  const contactSupport = () => {
    Alert.alert('Contact Support', 'Choose how you want to reach GoBuyMe support.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Email', onPress: () => openUrl(`mailto:${SUPPORT_EMAIL}`) },
      { text: 'Call', onPress: () => openUrl(`tel:${SUPPORT_PHONE}`) },
    ]);
  };

  const showWhatsNew = () => {
    Alert.alert(
      `What's New in v${APP_VERSION}`,
      'Improved order tracking, stronger account security, saved address updates, and smoother vendor/rider flows.',
    );
  };

  const SECTIONS = [
    {
      title: 'Appearance',
      items: [
        {
          icon: isDark ? 'moon' : 'sunny',
          label: 'Dark Mode',
          sub: isDark ? 'Switch to light theme' : 'Switch to dark theme',
          control: (
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: T.surface3, true: T.primary }}
              thumbColor="#fff"
            />
          ),
          onPress: toggleTheme,
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: 'language-outline',
          label: 'Language',
          sub: prefs.language,
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: () => setModalKey('language'),
        },
        {
          icon: 'location-outline',
          label: 'Default Delivery City',
          sub: prefs.deliveryCity,
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: () => setModalKey('deliveryCity'),
        },
        {
          icon: 'cash-outline',
          label: 'Currency',
          sub: prefs.currency,
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: () => setModalKey('currency'),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          icon: 'information-circle-outline',
          label: 'App Version',
          sub: `v${APP_VERSION}`,
          control: null,
          onPress: () => Alert.alert('App Version', `GoBuyMe v${APP_VERSION}`),
        },
        {
          icon: 'star-outline',
          label: 'What\'s New',
          sub: 'See latest updates',
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: showWhatsNew,
        },
        {
          icon: 'chatbubble-ellipses-outline',
          label: 'Contact Support',
          sub: SUPPORT_EMAIL,
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: contactSupport,
        },
        {
          icon: 'globe-outline',
          label: 'Website',
          sub: WEBSITE_URL.replace(/^https?:\/\//, ''),
          control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
          onPress: () => openUrl(WEBSITE_URL),
        },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {SECTIONS.map(section => (
          <View key={section.title} style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: T.textMuted }]}>{section.title.toUpperCase()}</Text>
            <View style={[styles.sectionCard, { backgroundColor: T.surface, borderColor: T.border }]}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                  style={[
                    styles.row,
                    { borderBottomColor: T.border, borderBottomWidth: i < section.items.length - 1 ? 1 : 0 },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: T.primaryTint }]}>
                    <Ionicons name={item.icon as any} size={18} color={T.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: T.text }]}>{item.label}</Text>
                    {item.sub && <Text style={[styles.rowSub, { color: T.textSec }]}>{item.sub}</Text>}
                  </View>
                  {item.control}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.buildInfo, { color: T.textMuted }]}>
          GoBuyMe © 2026 · Bubble Barrel
        </Text>
      </ScrollView>

      <Modal visible={!!modalKey} animationType="slide" transparent onRequestClose={() => setModalKey(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>
                {modalKey ? MODAL_TITLE[modalKey] : ''}
              </Text>
              <TouchableOpacity onPress={() => setModalKey(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={T.textSec} />
              </TouchableOpacity>
            </View>

            {modalKey && OPTIONS[modalKey].map(option => {
              const selected = prefs[modalKey] === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => updatePref(modalKey, option)}
                  style={[styles.optionRow, { borderBottomColor: T.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.optionText, { color: selected ? T.primary : T.text }]}>
                    {option}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={T.primary} />}
                </TouchableOpacity>
              );
            })}

            {modalKey === 'currency' && (
              <Text style={[styles.modalNote, { color: T.textSec }]}>
                Payments and prices currently use Nigerian Naira across GoBuyMe.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1 },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 17, fontWeight: '700' },
  scroll:      { padding: 20, gap: 20, paddingBottom: 40 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  sectionCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon:     { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { fontSize: 14, fontWeight: '600' },
  rowSub:      { fontSize: 12, marginTop: 1 },
  buildInfo:   { textAlign: 'center', fontSize: 12, marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  optionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  optionText: { fontSize: 14, fontWeight: '600' },
  modalNote: { fontSize: 12, lineHeight: 18, marginTop: 12 },
});
