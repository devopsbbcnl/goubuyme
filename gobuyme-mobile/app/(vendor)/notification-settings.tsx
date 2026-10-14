import { router } from 'expo-router';
import NotificationSettingsScreen from '@/screens/shared/NotificationSettingsScreen';

export default function VendorNotificationSettings() {
  return <NotificationSettingsScreen role="vendor" onBack={() => router.navigate('/(vendor)/notifications' as never)} />;
}
