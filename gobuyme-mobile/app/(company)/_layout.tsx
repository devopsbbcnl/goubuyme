import { Tabs } from 'expo-router';
import { AppState, StatusBar } from 'react-native';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import { ApprovalBanner } from '@/components/ui/ApprovalBanner';

export default function CompanyLayout() {
  const { user, updateApprovalStatus } = useAuth();
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  // Keep the pending/approved banner honest: re-check on open and whenever the app returns to the foreground.
  useEffect(() => {
    if (!user) return;

    const refreshApproval = () => {
      api.get('/auth/activation-status')
        .then(res => {
          const { approvalStatus } = res.data.data;
          if (approvalStatus !== user.approvalStatus) updateApprovalStatus(approvalStatus);
        })
        .catch(() => {});
    };

    refreshApproval();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshApproval();
    });
    return () => sub.remove();
  }, [user?.id]);

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" />
      {user?.approvalStatus !== 'APPROVED' && <ApprovalBanner role="company" />}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: T.primary,
          tabBarInactiveTintColor: T.textMuted,
          tabBarStyle: {
            backgroundColor: T.surface,
            borderTopColor: T.border,
            borderTopWidth: 1,
            paddingBottom: insets.bottom + 12,
            paddingTop: 8,
            height: 56 + insets.bottom + 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            fontFamily: 'PlusJakartaSans_600SemiBold',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Overview',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="fleet"
          options={{
            title: 'Fleet',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="deliveries"
          options={{
            title: 'Deliveries',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'bicycle' : 'bicycle-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: 'Account',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
