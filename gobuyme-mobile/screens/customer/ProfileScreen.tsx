import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav } from '@/components/layout/BottomNav';

type MenuItem = {
  icon: string;
  label: string;
  sub: string | null;
  route?: string;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: '📦', label: 'My Orders',         sub: 'View order history',        route: '/orders' },
  { icon: '📍', label: 'Saved Addresses',   sub: 'Home, Work, and more',      route: '/saved-addresses' },
  { icon: '🔔', label: 'Notifications',     sub: 'Manage alerts',             route: '/notifications' },
  { icon: '🎁', label: 'Offers & Promos',   sub: 'Available deals',           route: '/offers-promos' },
  { icon: '⭐', label: 'Rate the App',      sub: 'Leave a review',            route: '/rate-app' },
  { icon: '🔐', label: 'Privacy & Security',sub: 'Manage data',               route: '/privacy-security' },
  { icon: '⚙️', label: 'Settings',          sub: 'Theme, language & more',    route: '/settings' },
  { icon: '🚪', label: 'Sign Out',          sub: null },
];

export default function ProfileScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleItem = (item: MenuItem) => {
    if (item.label === 'Sign Out') {
      logout();
      router.replace('/onboarding');
      return;
    }
    if (item.route) router.push(item.route as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: T.text, paddingTop: insets.top + 16 }]}>Profile</Text>

        {/* Avatar + info */}
        <View style={[styles.avatarRow, { borderBottomColor: T.border }]}>
          <TouchableOpacity onPress={() => router.push('/edit-profile')} activeOpacity={0.85}>
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={[styles.avatarImg, { borderColor: T.border }]} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: T.primaryTint, borderColor: T.border }]}>
                <Text style={{ fontSize: 28 }}>👤</Text>
              </View>
            )}
            <View style={[styles.cameraBtn, { backgroundColor: T.primary }]}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: T.text }]}>{user?.name ?? 'Guest'}</Text>
            <Text style={[styles.userInfo, { color: T.textSec }]}>{user?.email ?? ''}</Text>
            {user?.phone ? (
              <Text style={[styles.userInfo, { color: T.textSec }]}>{user.phone}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => router.push('/edit-profile')}
            style={[styles.editBtn, { backgroundColor: T.primaryTint }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.editBtnText, { color: T.primary }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Menu items */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              onPress={() => handleItem(item)}
              style={[
                styles.menuRow,
                { borderBottomColor: T.border, borderBottomWidth: i < MENU_ITEMS.length - 1 ? 1 : 0 },
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: item.label === 'Sign Out' ? T.error : T.text }]}>
                  {item.label}
                </Text>
                {item.sub && (
                  <Text style={[styles.menuSub, { color: T.textSec }]}>{item.sub}</Text>
                )}
              </View>
              {item.label !== 'Sign Out' && (
                <Ionicons name="chevron-forward" size={14} color={T.textMuted} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <BottomNav active="profile" onPress={(tab) => {
        if (tab === 'home') router.replace('/(customer)');
        if (tab === 'orders') router.push('/orders');
        if (tab === 'favorites') router.push('/favorites');
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle:   { fontSize: 22, fontWeight: '800', paddingHorizontal: 20, paddingBottom: 16 },
  avatarRow:   { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingBottom: 24, borderBottomWidth: 1 },
  avatar:      { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarImg:   { width: 64, height: 64, borderRadius: 32, borderWidth: 2 },
  cameraBtn:   { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  userName:    { fontSize: 17, fontWeight: '800' },
  userInfo:    { fontSize: 13, marginTop: 1 },
  editBtn:     { borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12 },
  editBtnText: { fontSize: 12, fontWeight: '700' },
  menuRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  menuIcon:    { fontSize: 20, width: 24, textAlign: 'center' },
  menuLabel:   { fontSize: 14, fontWeight: '600' },
  menuSub:     { fontSize: 11, marginTop: 1 },
});
