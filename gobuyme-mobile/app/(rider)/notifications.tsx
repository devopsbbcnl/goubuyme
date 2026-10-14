import { router } from 'expo-router';
import NotificationInboxScreen from '@/screens/shared/NotificationInboxScreen';

export default function RiderNotifications() {
  return (
    <NotificationInboxScreen
      settingsRoute="/(rider)/notification-settings"
      onBack={() => router.navigate('/(rider)' as never)}
    />
  );
}
