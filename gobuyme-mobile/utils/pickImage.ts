import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface PickOptions {
  aspect?: [number, number];
  quality?: number;
  allowsEditing?: boolean;
}

export function pickImage(options: PickOptions = {}): Promise<string | null> {
  const { aspect = [1, 1], quality = 0.8, allowsEditing = true } = options;

  return new Promise((resolve) => {
    Alert.alert('Upload Photo', 'Choose a source', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow camera access to take a photo.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing,
            aspect,
            quality,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow photo library access to choose an image.');
            resolve(null);
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing,
            aspect,
            quality,
          });
          resolve(result.canceled ? null : result.assets[0].uri);
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => resolve(null),
      },
    ]);
  });
}
