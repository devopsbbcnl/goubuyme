import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// Remote push notifications were removed from Expo Go in SDK 53 — only dev-client/standalone
// builds support them now. Registering the handler and requesting a push token there throws.
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || isExpoGo) return;

    (async () => {
      if (!Device.isDevice) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF521B',
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      const finalStatus =
        existing === 'granted'
          ? existing
          : (await Notifications.requestPermissionsAsync()).status;

      if (finalStatus !== 'granted') return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

      let token: string;
      try {
        ({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId }));
      } catch {
        // Android: throws until google-services.json (FCM) is bundled in the build
        return;
      }

      try {
        await api.post('/notifications/register-token', { token });
      } catch {
        // non-critical — user still works without push
      }
    })();
  }, [user?.id]);
}
