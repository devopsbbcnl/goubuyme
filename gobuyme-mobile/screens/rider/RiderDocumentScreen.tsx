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
  PENDING:  { color: '#F5A623', icon: 'time-outline',     label: 'Under Review' },
  VERIFIED: { color: '#1A9E5F', icon: 'checkmark-circle', label: 'Verified' },
  REJECTED: { color: '#E23B3B', icon: 'close-circle',     label: 'Rejected — Resubmit' },
};

interface RiderDoc {
  id: string;
  ninNumber: string;
  ninImageUrl: string | null;
  selfieUrl: string | null;
  vehicleImageUrl: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  guarantorAddress: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote: string | null;
}

export default function RiderDocumentScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [existing, setExisting] = useState<RiderDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [ninNumber, setNinNumber] = useState('');
  const [ninImgUri, setNinImgUri] = useState('');
  const [ninImgUrl, setNinImgUrl] = useState('');
  const [selfieUri, setSelfieUri] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [vehicleImgUri, setVehicleImgUri] = useState('');
  const [vehicleImgUrl, setVehicleImgUrl] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorAddress, setGuarantorAddress] = useState('');

  const [uploadingNin, setUploadingNin] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingVehicle, setUploadingVehicle] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/riders/me/document');
      const data: RiderDoc | null = res.data.data;
      setExisting(data);
      if (data) {
        setNinNumber(data.ninNumber);
        setNinImgUrl(data.ninImageUrl ?? '');
        setSelfieUrl(data.selfieUrl ?? '');
        setVehicleImgUrl(data.vehicleImageUrl ?? '');
        setGuarantorName(data.guarantorName ?? '');
        setGuarantorPhone(data.guarantorPhone ?? '');
        setGuarantorAddress(data.guarantorAddress ?? '');
      }
    } catch {
      // no doc yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  const pickImg = async (
    type: 'nin' | 'selfie' | 'vehicle',
    aspect?: [number, number],
  ) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: aspect ?? [3, 2],
      quality: 0.9,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;

    if (type === 'nin') { setNinImgUri(uri); setUploadingNin(true); }
    else if (type === 'selfie') { setSelfieUri(uri); setUploadingSelfie(true); }
    else { setVehicleImgUri(uri); setUploadingVehicle(true); }

    try {
      const url = await uploadImage(uri);
      if (type === 'nin') setNinImgUrl(url);
      else if (type === 'selfie') setSelfieUrl(url);
      else setVehicleImgUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload image. Please try again.');
      if (type === 'nin') setNinImgUri('');
      else if (type === 'selfie') setSelfieUri('');
      else setVehicleImgUri('');
    } finally {
      if (type === 'nin') setUploadingNin(false);
      else if (type === 'selfie') setUploadingSelfie(false);
      else setUploadingVehicle(false);
    }
  };

  const handleSubmit = async () => {
    if (!ninNumber.trim()) {
      Alert.alert('Required', 'Please enter your NIN.');
      return;
    }
    try {
      setSaving(true);
      await api.post('/riders/me/document', {
        ninNumber: ninNumber.trim(),
        ninImageUrl: ninImgUrl || null,
        selfieUrl: selfieUrl || null,
        vehicleImageUrl: vehicleImgUrl || null,
        guarantorName: guarantorName.trim() || null,
        guarantorPhone: guarantorPhone.trim() || null,
        guarantorAddress: guarantorAddress.trim() || null,
      });
      Alert.alert('Submitted', 'Your documents have been submitted for review.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Failed', 'Could not submit documents. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isVerified = existing?.status === 'VERIFIED';
  const statusMeta = existing ? STATUS_META[existing.status] : null;
  const busy = saving || uploadingNin || uploadingSelfie || uploadingVehicle;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>

        <Text style={[styles.heading, { color: T.text }]}>Identity Documents</Text>
        <Text style={[styles.sub, { color: T.textSec }]}>
          Your NIN, a selfie, and vehicle/guarantor details are required before your account can be activated.
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
                  {existing?.reviewNote && (
                    <Text style={[styles.reviewNote, { color: T.textSec }]}>{existing.reviewNote}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Section: Identity */}
            <SectionLabel label="IDENTITY" T={T} />

            <Text style={[styles.label, { color: T.textSec }]}>NIN (National ID Number) *</Text>
            <TextInput
              value={ninNumber}
              onChangeText={setNinNumber}
              placeholder="11-digit NIN"
              placeholderTextColor={T.textMuted}
              keyboardType="numeric"
              maxLength={11}
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>NIN Slip / ID Card Image</Text>
            <ImgBox
              uri={ninImgUri || ninImgUrl}
              uploading={uploadingNin}
              disabled={isVerified}
              onPress={() => pickImg('nin')}
              icon="id-card-outline"
              hint="Tap to upload NIN slip"
              T={T}
            />

            <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Selfie / Liveness Photo</Text>
            <ImgBox
              uri={selfieUri || selfieUrl}
              uploading={uploadingSelfie}
              disabled={isVerified}
              onPress={() => pickImg('selfie', [1, 1])}
              icon="person-circle-outline"
              hint="Tap to upload a clear selfie"
              T={T}
            />

            {/* Section: Vehicle */}
            <SectionLabel label="VEHICLE" T={T} mt={24} />

            <Text style={[styles.label, { color: T.textSec }]}>Vehicle Photo</Text>
            <ImgBox
              uri={vehicleImgUri || vehicleImgUrl}
              uploading={uploadingVehicle}
              disabled={isVerified}
              onPress={() => pickImg('vehicle', [4, 3])}
              icon="car-outline"
              hint="Tap to upload vehicle photo"
              T={T}
            />

            {/* Section: Guarantor */}
            <SectionLabel label="GUARANTOR" T={T} mt={24} />
            <Text style={[styles.sectionSub, { color: T.textSec }]}>
              A guarantor vouches for your reliability. This is strongly recommended.
            </Text>

            <Text style={[styles.label, { color: T.textSec }]}>Guarantor Full Name</Text>
            <TextInput
              value={guarantorName}
              onChangeText={setGuarantorName}
              placeholder="e.g. Chukwudi Okafor"
              placeholderTextColor={T.textMuted}
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Guarantor Phone Number</Text>
            <TextInput
              value={guarantorPhone}
              onChangeText={setGuarantorPhone}
              placeholder="e.g. 08012345678"
              placeholderTextColor={T.textMuted}
              keyboardType="phone-pad"
              editable={!isVerified}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Guarantor Address</Text>
            <TextInput
              value={guarantorAddress}
              onChangeText={setGuarantorAddress}
              placeholder="Street address"
              placeholderTextColor={T.textMuted}
              multiline
              numberOfLines={2}
              editable={!isVerified}
              style={[styles.textarea, { backgroundColor: T.surface, borderColor: T.border, color: T.text, opacity: isVerified ? 0.6 : 1 }]}
            />

            {/* Privacy */}
            <View style={[styles.privacyBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Ionicons name="lock-closed-outline" size={13} color={T.textMuted} style={{ marginTop: 1 }} />
              <Text style={[styles.privacyText, { color: T.textMuted }]}>
                Your documents are encrypted and used only for identity verification. They are never shared with third parties.
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
            disabled={busy}
            style={[styles.btn, { backgroundColor: busy ? T.surface3 : T.primary }]}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>
                {existing ? 'Resubmit Documents' : 'Submit Documents'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SectionLabel({ label, T, mt }: { label: string; T: any; mt?: number }) {
  return (
    <Text style={[{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 12, marginTop: mt ?? 0 }, { color: T.textSec }]}>
      {label}
    </Text>
  );
}

function ImgBox({
  uri, uploading, disabled, onPress, icon, hint, T,
}: {
  uri: string; uploading: boolean; disabled: boolean;
  onPress: () => void; icon: string; hint: string; T: any;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.85}
      style={[styles.imgBox, { backgroundColor: T.surface, borderColor: T.border, opacity: disabled ? 0.6 : 1 }]}
    >
      {uri ? (
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} resizeMode="cover" />
      ) : (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Ionicons name={icon as any} size={26} color={T.textMuted} />
          <Text style={{ fontSize: 12, color: T.textMuted, fontFamily: 'PlusJakartaSans_400Regular' }}>{hint}</Text>
        </View>
      )}
      {uploading ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : uri && !disabled ? (
        <View style={[styles.chip, { backgroundColor: T.primary }]}>
          <Ionicons name="camera" size={13} color="#fff" />
          <Text style={styles.chipText}>Change</Text>
        </View>
      ) : null}
    </TouchableOpacity>
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
  sectionSub: { fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 12, marginTop: -6 },
  label: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 6 },
  input: { height: 48, borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  textarea: {
    borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, paddingTop: 12,
    fontSize: 14, minHeight: 72, textAlignVertical: 'top',
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  imgBox: {
    height: 110, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
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
