import { router } from 'expo-router';
import NotificationSettingsScreen from '@/screens/shared/NotificationSettingsScreen';

export default function RiderNotificationSettings() {
  return <NotificationSettingsScreen role="rider" onBack={() => router.navigate('/(rider)/notifications' as never)} />;
}
