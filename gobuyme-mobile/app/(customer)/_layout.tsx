import { Stack } from 'expo-router';
import { StatusBar, View } from 'react-native';
import WhatsAppFab from '@/components/WhatsAppFab';
export default function CustomerLayout() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent backgroundColor="transparent" />
      <Stack screenOptions={{ headerShown: false }} />
      <WhatsAppFab />
    </View>
  );
}
