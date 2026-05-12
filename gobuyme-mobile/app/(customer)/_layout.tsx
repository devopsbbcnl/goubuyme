import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
export default function CustomerLayout() {
  return (
    <>
      <StatusBar translucent backgroundColor="transparent" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
