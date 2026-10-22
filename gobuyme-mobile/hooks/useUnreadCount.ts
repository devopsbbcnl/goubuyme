import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from '@/services/api';

// Remote push is unavailable in Expo Go (see usePushNotifications), so there is no listener to attach there.
const isExpoGo = Constants.appOwnership === 'expo';

// How many notifications the user has not opened. Refreshes when the screen comes
// back into focus, when the app returns to the foreground, and when a push lands
// while the app is open, so the bell badge stays honest without polling.
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    api.get('/notifications/unread-count')
      .then(res => setCount(Number(res.data.data?.count) || 0))
      .catch(() => {}); // a badge is never worth an error message
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    const appSub = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
    const pushSub = isExpoGo ? null : Notifications.addNotificationReceivedListener(() => refresh());
    return () => {
      appSub.remove();
      pushSub?.remove();
    };
  }, [refresh]);

  return { count, refresh };
}
