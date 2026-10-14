import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUnreadCount } from '@/hooks/useUnreadCount';

// The header bell: opens the inbox and shows how many notifications are unread.
export function NotificationBell({ route }: { route: string }) {
  const { theme: T } = useTheme();
  const { count } = useUnreadCount();

  return (
    <TouchableOpacity
      onPress={() => router.push(route as never)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      style={{
        width: 40, height: 40, borderRadius: 9999, backgroundColor: T.surface,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name="notifications-outline" size={20} color={T.text} />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9999,
          backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
