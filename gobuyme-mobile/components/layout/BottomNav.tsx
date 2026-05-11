import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { FontAwesome } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'home' | 'orders' | 'favorites' | 'profile';

interface Props {
  active?: Tab;
  onPress: (tab: Tab) => void;
}

export function BottomNav({ active, onPress }: Props) {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const renderIcon = (tab: Tab) => {
    const isActive = tab === active;
    const color = isActive ? T.primary : T.textMuted;

    switch (tab) {
      case 'home':
        return <Ionicons name={isActive ? 'home' : 'home-outline'} size={22} color={color} />;
      case 'orders':
        return <Ionicons name={isActive ? 'receipt' : 'receipt-outline'} size={22} color={color} />;
      case 'favorites':
        return <MaterialIcons name={isActive ? 'favorite' : 'favorite-outline'} size={23} color={color} />;
      case 'profile':
        return <FontAwesome name={isActive ? 'user' : 'user-o'} size={20} color={color} />;
    }
  };

  const LABELS: Record<Tab, string> = {
    home: 'Home',
    orders: 'My Orders',
    favorites: 'Favorites',
    profile: 'Profile',
  };

  return (
    <View style={[
      styles.container,
      { backgroundColor: T.surface, borderTopColor: T.border, paddingBottom: insets.bottom + 8 },
    ]}>
      {(['home', 'orders', 'favorites', 'profile'] as Tab[]).map(tab => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onPress(tab)}
            activeOpacity={0.7}
            style={styles.tab}
          >
            {renderIcon(tab)}
            <Text style={[styles.label, { color: isActive ? T.primary : T.textMuted }]}>
              {LABELS[tab]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 12 },
  tab:       { flex: 1, alignItems: 'center', gap: 4 },
  label:     { fontSize: 10, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
});
