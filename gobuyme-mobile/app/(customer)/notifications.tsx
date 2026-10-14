import { router } from 'expo-router';
import NotificationInboxScreen from '@/screens/shared/NotificationInboxScreen';

export default function CustomerNotifications() {
  return <NotificationInboxScreen settingsRoute="/notification-settings" onBack={() => router.back()} />;
}
