import { router } from 'expo-router';
import NotificationInboxScreen from '@/screens/shared/NotificationInboxScreen';

export default function VendorNotifications() {
  return (
    <NotificationInboxScreen
      settingsRoute="/(vendor)/notification-settings"
      onBack={() => router.navigate('/(vendor)' as never)}
    />
  );
}
