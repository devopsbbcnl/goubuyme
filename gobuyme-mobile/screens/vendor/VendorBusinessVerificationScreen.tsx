import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

async function uploadImage(uri: string): Promise<string> {
  if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') return uri;
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw new Error('Upload failed');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

const STATUS_META: Record<string, { color: string; icon: string; label: string }> = {
  PENDING:  { color: '#F5A623', icon: 'time-outline',           label: 'Pending Review' },
  VERIFIED: { color: '#1A9E5F', icon: 'checkmark-circle',       label: 'Verified' },
  REJECTED: { color: '#E23B3B', icon: 'close-circle',           label: 'Rejected' },
};

interface BizVerif {
  id: string;
  cacNumber: string | null;
  cacImageUrl: string | null;
  tin: string | null;
  directorNin: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote: string | null;
}

export default function VendorBusinessVerificationScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [existing, setExisting] = useState<BizVerif | null>(null);
  const [loading, setLoading] = useState(true);

  const [cacNumber, setCacNumber] = useState('');
  const [cacImageUri, setCacImageUri] = useState('');
  const [cacImageUrl, setCacImageUrl] = useState('');
  const [uploadingCac, setUploadingCac] = useState(false);
  const [tin, setTin] = useState('');
  const [directorNin, setDirectorNin] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors/me/business-verification');
      const data: BizVerif | null = res.data.data;
      setExisting(data);
      if (data) {
        setCacNumber(data.cacNumber ?? '');
        setCacImageUrl(data.cacImageUrl ?? '');
        setTin(data.tin ?? '');
        setDirectorNin(data.directorNin ?? '');
      }
    } catch {
      // no existing record is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const pickCacImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.9,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setCacImageUri(uri);
    setUploadingCac(true);
    try {
      const url = await uploadImage(uri);
      setCacImageUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload image. Please try again.');
      setCacImageUri('');
    } finally {
      setUploadingCac(false);
    }
  };

  const handleSubmit = async () => {
    if (!cacNumber.trim() && !cacImageUrl) {
      Alert.alert('Required', 'Please enter your CAC number or upload your CAC certificate.');
      return;
    }
    try {
      setSaving(true);
      await api.post('/vendors/me/business-verification', {
        cacNumber: cacNumber.trim() || null,
        cacImageUrl: cacImageUrl || null,
        tin: tin.trim() || null,
        directorNin: directorNin.trim() || null,
      });
      Alert.alert('Submitted', 'Your business verification has been submitted for review.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Failed', 'Could not submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isVerified = existing?.status === 'VERIFIED';
  const statusMeta = existing ? STATUS_META[existing.status] : null;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>

        <Text style={[styles.heading, { color: T.text }]}>Business Verification</Text>
        <Text style={[styles.sub, { color: T.textSec }]}>
          Submit your CAC registration to unlock the Business Verified badge. Required for restaurants, pharmacies, and registered businesses.
        </Text>

        {loading ? (
          <ActivityIndicator color={T.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Status banner */}
            {statusMeta && (
              <View style={[styles.statusBanner, { backgroundColor: statusMeta.color + '18', borderColor: statusMeta.color + '40' }]}>
                <Ionicons name={statusMeta.icon as any} size={18} color={statusMeta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusLabel, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                  {existing?.reviewNote ? (
                    <Text style={[styles.reviewNote, { color: T.textSec }]}>{existing.reviewNote}</Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* CAC Number */}
            <Text style={[styles.label, { color: T.textSec }]}>CAC Registration Number</Text>
            <TextInput
              value={cacNumber}
              onChangeText={setCacNumber}
              placeholder="e.g. RC-1234567"
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            {/* CAC Certificate Image */}
            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>CAC Certificate Image</Text>
            <TouchableOpacity
              onPress={isVerified ? undefined : pickCacImage}
              activeOpacity={0.85}
              style={[styles.docImgBox, { backgroundColor: T.surface, borderColor: T.border, opacity: isVerified ? 0.6 : 1 }]}
            >
              {cacImageUri || cacImageUrl ? (
                <Image
                  source={{ uri: cacImageUri || cacImageUrl }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 4 }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="document-text-outline" size={28} color={T.textMuted} />
                  <Text style={[styles.pickerHint, { color: T.textMuted }]}>Tap to upload CAC certificate</Text>
                </View>
              )}
              {uploadingCac ? (
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 }]}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : (cacImageUri || cacImageUrl) && !isVerified ? (
                <View style={[styles.chip, { backgroundColor: T.primary }]}>
                  <Ionicons name="camera" size={13} color="#fff" />
                  <Text style={styles.chipText}>Change</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            {/* TIN */}
            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>Tax Identification Number (TIN) — Optional</Text>
            <TextInput
              value={tin}
              onChangeText={setTin}
              placeholder="e.g. 12345678-0001"
              placeholderTextColor={T.textMuted}
              keyboardType="numbers-and-punctuation"
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            {/* Director NIN */}
            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>Director / Owner NIN — Optional</Text>
            <TextInput
              value={directorNin}
              onChangeText={setDirectorNin}
              placeholder="11-digit NIN"
              placeholderTextColor={T.textMuted}
              keyboardType="numeric"
              maxLength={11}
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            {/* Privacy note */}
            <View style={[styles.privacyBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Ionicons name="lock-closed-outline" size={13} color={T.textMuted} style={{ marginTop: 1 }} />
              <Text style={[styles.privacyText, { color: T.textMuted }]}>
                Your business documents are encrypted and used only for verification. They are never shared with third parties.
              </Text>
            </View>

            <View style={{ height: 100 }} />
          </>
        )}
      </ScrollView>

      {!isVerified && !loading && (
        <View style={[styles.footer, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving || uploadingCac}
            style={[styles.btn, { backgroundColor: (saving || uploadingCac) ? T.surface3 : T.primary }]}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>Submit for Review</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24 },
  back: { marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 22, fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 24 },
  statusBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 4, borderWidth: 1, padding: 12, marginBottom: 20,
  },
  statusLabel: { fontSize: 13, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  reviewNote: { fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 2 },
  label: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 6 },
  input: { height: 48, borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  docImgBox: {
    height: 120, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  pickerHint: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  chip: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8,
  },
  chipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  privacyBox: { flexDirection: 'row', gap: 8, borderRadius: 4, padding: 12, marginTop: 20 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' },
  footer: { padding: 20, borderTopWidth: 1 },
  btn: { height: 52, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
