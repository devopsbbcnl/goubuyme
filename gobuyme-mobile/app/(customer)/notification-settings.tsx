import { router } from 'expo-router';
import NotificationSettingsScreen from '@/screens/shared/NotificationSettingsScreen';

export default function CustomerNotificationSettings() {
  return <NotificationSettingsScreen role="customer" onBack={() => router.back()} />;
}
