import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { pickImage as openImagePicker } from '@/utils/pickImage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';
import { KeyboardAvoidingWrapper } from '@/components/ui/KeyboardAvoidingWrapper';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

async function uploadImage(uri: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error('Image upload is not configured. Contact support.');
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: 'POST', body: form },
    );
  } catch (err: any) {
    console.error('[uploadImage] network error', err);
    throw new Error(`Network error while uploading: ${err?.message ?? 'unknown'}`);
  }
  const data = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !data.secure_url) {
    const reason = data?.error?.message ?? `HTTP ${res.status}`;
    console.error('[uploadImage] Cloudinary rejected upload:', reason);
    throw new Error(`Image upload failed: ${reason}`);
  }
  return data.secure_url;
}

// NIN/BVN are deliberately not collected from vendors (NDPA data minimisation).
type DocType = 'DRIVERS_LICENSE' | 'PASSPORT';

const DOC_META: Record<DocType, { label: string; numberLabel: string; placeholder: string; backRequired: boolean }> = {
  DRIVERS_LICENSE: { label: "Driver's License", numberLabel: 'License Number', placeholder: 'e.g. ABC123456XY', backRequired: true },
  PASSPORT: { label: 'Passport', numberLabel: 'Passport Number', placeholder: 'e.g. A12345678', backRequired: false },
};

const STATUS_META: Record<string, { color: string; icon: string; label: string }> = {
  PENDING:  { color: '#F5A623', icon: 'time-outline',     label: 'Pending Review' },
  VERIFIED: { color: '#1A9E5F', icon: 'checkmark-circle', label: 'Verified — Update if your ID has changed or expired' },
  REJECTED: { color: '#E23B3B', icon: 'close-circle',     label: 'Rejected — Please resubmit' },
};

const REJECTED_ITEM_LABELS: Record<string, string> = {
  ID_FRONT: 'ID document (front)',
  ID_BACK: 'ID document (back)',
  SELFIE: 'Selfie photo',
};

interface VendorDoc {
  id: string;
  type: DocType;
  number: string;
  imageUrl: string;
  imageUrlBack: string | null;
  selfieUrl: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote: string | null;
  rejectedItem: string | null;
}

type Slot = 'front' | 'back' | 'selfie';

export default function VendorIdentityDocumentScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [existing, setExisting] = useState<VendorDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [docType, setDocType] = useState<DocType>('DRIVERS_LICENSE');
  const [docNumber, setDocNumber] = useState('');
  // uri = freshly picked local image (marks the form dirty); url = uploaded/stored copy
  const [uris, setUris] = useState<Record<Slot, string>>({ front: '', back: '', selfie: '' });
  const [urls, setUrls] = useState<Record<Slot, string>>({ front: '', back: '', selfie: '' });
  const [uploading, setUploading] = useState<Record<Slot, boolean>>({ front: false, back: false, selfie: false });
  const [saving, setSaving] = useState(false);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors/me/document');
      const data: VendorDoc | null = res.data.data;
      setExisting(data);
      if (data) {
        setDocType(data.type);
        setDocNumber(data.number);
        setUrls({ front: data.imageUrl, back: data.imageUrlBack ?? '', selfie: data.selfieUrl ?? '' });
      }
    } catch {
      // no document yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  const changeDocType = (dt: DocType) => {
    if (dt === docType) return;
    setDocType(dt);
    setDocNumber('');
    setUris(u => ({ ...u, front: '', back: '' }));
    setUrls(u => ({ ...u, front: '', back: '' }));
  };

  const pick = async (slot: Slot) => {
    let uri: string | null = null;
    if (slot === 'selfie') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take your selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      uri = result.canceled ? null : result.assets[0].uri;
    } else {
      uri = await openImagePicker({ allowsEditing: false, quality: 0.9 });
    }
    if (!uri) return;

    setUris(u => ({ ...u, [slot]: uri }));
    setUploading(u => ({ ...u, [slot]: true }));
    try {
      const url = await uploadImage(uri);
      setUrls(u => ({ ...u, [slot]: url }));
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Could not upload image. Please try again.');
      setUris(u => ({ ...u, [slot]: '' }));
    } finally {
      setUploading(u => ({ ...u, [slot]: false }));
    }
  };

  const meta = DOC_META[docType];

  const handleSubmit = async () => {
    if (!docNumber.trim()) {
      Alert.alert('Required', `Please enter your ${meta.numberLabel}.`);
      return;
    }
    if (!urls.front) {
      Alert.alert('Required', 'Please upload an image of your document.');
      return;
    }
    if (meta.backRequired && !urls.back) {
      Alert.alert('Required', "Please upload the back of your driver's license.");
      return;
    }
    try {
      setSaving(true);
      await api.post('/vendors/me/document', {
        type: docType,
        number: docNumber.trim(),
        imageUrl: urls.front,
        imageUrlBack: meta.backRequired ? urls.back || null : null,
        selfieUrl: urls.selfie || null,
      });
      Alert.alert('Submitted', 'Your ID has been submitted for review.', [
        { text: 'OK', onPress: () => router.navigate('/(vendor)/profile' as any) },
      ]);
      setUris({ front: '', back: '', selfie: '' });
      await fetchDoc();
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.message ?? 'Could not submit your ID. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = existing ? STATUS_META[existing.status] : null;
  const busy = saving || uploading.front || uploading.back || uploading.selfie;

  const isDirty = useMemo(() => {
    if (!existing) return true; // first-time submission — always allow
    return (
      docType !== existing.type ||
      docNumber.trim() !== existing.number ||
      uris.front !== '' || uris.back !== '' || uris.selfie !== ''
    );
  }, [existing, docType, docNumber, uris]);

  return (
    <KeyboardAvoidingWrapper>
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.navigate('/(vendor)/profile' as any)} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>

        <Text style={[styles.heading, { color: T.text }]}>Identity Document</Text>
        <Text style={[styles.sub, { color: T.textSec }]}>
          Optional — submit a government-issued ID to earn the ID Verified badge on your store.
        </Text>

        {loading ? (
          <ActivityIndicator color={T.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {statusMeta && (
              <View style={[styles.statusBanner, { backgroundColor: statusMeta.color + '18', borderColor: statusMeta.color + '40' }]}>
                <Ionicons name={statusMeta.icon as any} size={18} color={statusMeta.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusLabel, { color: statusMeta.color }]}>
                    {statusMeta.label}
                    {existing?.status === 'REJECTED' && existing.rejectedItem
                      ? ` — ${REJECTED_ITEM_LABELS[existing.rejectedItem] ?? existing.rejectedItem}`
                      : ''}
                  </Text>
                  {existing?.reviewNote ? (
                    <Text style={[styles.reviewNote, { color: T.textSec }]}>{existing.reviewNote}</Text>
                  ) : null}
                </View>
              </View>
            )}

            <Text style={[styles.label, { color: T.textSec }]}>Document Type *</Text>
            <View style={styles.docTypeRow}>
              {(Object.keys(DOC_META) as DocType[]).map((dt) => (
                <TouchableOpacity
                  key={dt}
                  onPress={() => changeDocType(dt)}
                  activeOpacity={0.8}
                  style={[
                    styles.docTypeChip,
                    {
                      backgroundColor: docType === dt ? T.primary : T.surface,
                      borderColor: docType === dt ? T.primary : T.border,
                    },
                  ]}
                >
                  <Text style={[styles.docTypeChipText, { color: docType === dt ? '#fff' : T.textSec }]}>
                    {DOC_META[dt].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>{meta.numberLabel} *</Text>
            <TextInput
              value={docNumber}
              onChangeText={setDocNumber}
              placeholder={meta.placeholder}
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>
              {meta.backRequired ? 'Front of Document *' : 'Document Image *'}
            </Text>
            <ImgBox uri={uris.front || urls.front} uploading={uploading.front} onPress={() => pick('front')} icon="card-outline" hint="Tap to upload" T={T} />

            {meta.backRequired && (
              <>
                <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Back of Document *</Text>
                <ImgBox uri={uris.back || urls.back} uploading={uploading.back} onPress={() => pick('back')} icon="card-outline" hint="Tap to upload" T={T} />
              </>
            )}

            <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Selfie / Liveness Photo — Optional</Text>
            <ImgBox uri={uris.selfie || urls.selfie} uploading={uploading.selfie} onPress={() => pick('selfie')} icon="person-circle-outline" hint="Tap to take a clear selfie" T={T} />

            <View style={[styles.privacyBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Ionicons name="lock-closed-outline" size={13} color={T.textMuted} style={{ marginTop: 1 }} />
              <Text style={[styles.privacyText, { color: T.textMuted }]}>
                Your document is encrypted and used only for identity verification. It will never be shared with third parties.
              </Text>
            </View>

            <View style={{ height: 100 }} />
          </>
        )}
      </ScrollView>

      {!loading && (
        <View style={[styles.footer, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy || !isDirty}
            style={[styles.btn, { backgroundColor: (busy || !isDirty) ? T.surface3 : T.primary }]}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>{existing ? 'Update for Review' : 'Submit for Review'}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
    </KeyboardAvoidingWrapper>
  );
}

function ImgBox({
  uri, uploading, onPress, icon, hint, T,
}: {
  uri: string; uploading: boolean; onPress: () => void; icon: string; hint: string; T: any;
}) {
  return (
    <TouchableOpacity
      onPress={uploading ? undefined : onPress}
      activeOpacity={0.85}
      style={[styles.imgBox, { backgroundColor: T.surface, borderColor: T.border }]}
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
      ) : uri ? (
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
  label: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 6 },
  input: { height: 48, borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  docTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  docTypeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, borderWidth: 1 },
  docTypeChipText: { fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
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
