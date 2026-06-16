import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { pickImage as openImagePicker } from '@/utils/pickImage';
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
  VERIFIED: { color: '#1A9E5F', icon: 'checkmark-circle',       label: 'Verified — Update if your documents have changed or expired' },
  REJECTED: { color: '#E23B3B', icon: 'close-circle',           label: 'Rejected — Please resubmit' },
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

type Director = { name: string; phone: string; nin: string };

const BLANK_DIRECTOR: Director = { name: '', phone: '', nin: '' };

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
  const [directors, setDirectors] = useState<Director[]>([{ ...BLANK_DIRECTOR }]);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors/me/business-verification');
      const data: BizVerif | null = res.data.data;
      setExisting(data);
      if (data) {
        setCacNumber(data.cacNumber ?? '');
        setCacImageUrl(data.cacImageUrl ?? '');
        setTin(data.tin ?? '');
        // Seed first director's NIN from legacy field; name/phone start blank
        setDirectors([{ name: '', phone: '', nin: data.directorNin ?? '' }]);
      }
    } catch {
      // no existing record is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pickCacImage = async () => {
    const uri = await openImagePicker({ aspect: [3, 2], quality: 0.9 });
    if (!uri) return;
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

  const updateDirector = (index: number, field: keyof Director, value: string) => {
    setDirectors(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const addDirector = () => {
    setDirectors(prev => [...prev, { ...BLANK_DIRECTOR }]);
  };

  const removeDirector = (index: number) => {
    setDirectors(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!cacNumber.trim() && !cacImageUrl) {
      Alert.alert('Required', 'Please enter your CAC number or upload your CAC certificate.');
      return;
    }
    const filledDirectors = directors.filter(d => d.name.trim() || d.phone.trim() || d.nin.trim());
    try {
      setSaving(true);
      await api.post('/vendors/me/business-verification', {
        cacNumber: cacNumber.trim() || null,
        cacImageUrl: cacImageUrl || null,
        tin: tin.trim() || null,
        directorNin: filledDirectors[0]?.nin.trim() || null,
        directors: filledDirectors.map(d => ({
          name: d.name.trim() || null,
          phone: d.phone.trim() || null,
          nin: d.nin.trim() || null,
        })),
      });
      setExisting(prev => prev ? { ...prev, status: 'PENDING', reviewNote: null } : prev);
      Alert.alert('Submitted', 'Your business verification has been submitted for review.', [
        { text: 'OK', onPress: () => router.navigate('/(vendor)/profile' as any) },
      ]);
    } catch {
      Alert.alert('Failed', 'Could not submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = existing ? STATUS_META[existing.status] : null;

  const isDirty = useMemo(() => {
    if (!existing) return true;
    const hasDirectorChange = directors.some(d => d.name.trim() || d.phone.trim());
    return (
      cacNumber.trim() !== (existing.cacNumber ?? '') ||
      cacImageUri !== '' ||
      tin.trim() !== (existing.tin ?? '') ||
      directors[0]?.nin.trim() !== (existing.directorNin ?? '') ||
      hasDirectorChange ||
      directors.length > 1
    );
  }, [existing, cacNumber, cacImageUri, tin, directors]);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity onPress={() => router.navigate('/(vendor)/profile' as any)} style={styles.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            {/* CAC Certificate Image */}
            <Text style={[styles.label, { color: T.textSec, marginTop: 16 }]}>CAC Certificate Image</Text>
            <TouchableOpacity
              onPress={pickCacImage}
              activeOpacity={0.85}
              style={[styles.docImgBox, { backgroundColor: T.surface, borderColor: T.border }]}
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
              ) : (cacImageUri || cacImageUrl) ? (
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
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            {/* Directors */}
            <View style={styles.directorHeader}>
              <Text style={[styles.sectionTitle, { color: T.text }]}>Directors / Owners</Text>
              <Text style={[styles.sectionHint, { color: T.textMuted }]}>Optional</Text>
            </View>

            {directors.map((director, index) => (
              <View
                key={index}
                style={[styles.directorCard, { backgroundColor: T.surface, borderColor: T.border }]}
              >
                {/* Card header */}
                <View style={styles.directorCardHeader}>
                  <View style={[styles.directorBadge, { backgroundColor: T.primaryTint }]}>
                    <Text style={[styles.directorBadgeText, { color: T.primary }]}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={[styles.directorCardTitle, { color: T.text }]}>
                    {index === 0 ? 'Primary Director' : `Director ${index + 1}`}
                  </Text>
                  {directors.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeDirector(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#E23B3B" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Name */}
                <Text style={[styles.label, { color: T.textSec, marginTop: 12 }]}>Full Name</Text>
                <TextInput
                  value={director.name}
                  onChangeText={v => updateDirector(index, 'name', v)}
                  placeholder="e.g. Chukwuemeka Okafor"
                  placeholderTextColor={T.textMuted}
                  autoCapitalize="words"
                  style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
                />

                {/* Phone */}
                <Text style={[styles.label, { color: T.textSec, marginTop: 12 }]}>Phone Number</Text>
                <TextInput
                  value={director.phone}
                  onChangeText={v => updateDirector(index, 'phone', v)}
                  placeholder="e.g. 08012345678"
                  placeholderTextColor={T.textMuted}
                  keyboardType="phone-pad"
                  maxLength={14}
                  style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
                />

                {/* NIN */}
                <Text style={[styles.label, { color: T.textSec, marginTop: 12 }]}>NIN — Optional</Text>
                <TextInput
                  value={director.nin}
                  onChangeText={v => updateDirector(index, 'nin', v)}
                  placeholder="11-digit NIN"
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                  maxLength={11}
                  style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
                />
              </View>
            ))}

            {/* Add director button */}
            <TouchableOpacity
              onPress={addDirector}
              activeOpacity={0.8}
              style={[styles.addDirectorBtn, { borderColor: T.primary }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={T.primary} />
              <Text style={[styles.addDirectorText, { color: T.primary }]}>Add Another Director</Text>
            </TouchableOpacity>

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

      {!loading && (
        <View style={[styles.footer, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving || uploadingCac || !isDirty}
            style={[styles.btn, { backgroundColor: (saving || uploadingCac || !isDirty) ? T.surface3 : T.primary }]}
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
  directorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  sectionHint: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },
  directorCard: {
    borderRadius: 4, borderWidth: 1, padding: 16, marginBottom: 12,
  },
  directorCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  directorBadge: {
    width: 24, height: 24, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  directorBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  directorCardTitle: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  removeBtn: { padding: 4 },
  addDirectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    paddingVertical: 14, marginBottom: 20,
  },
  addDirectorText: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  privacyBox: { flexDirection: 'row', gap: 8, borderRadius: 4, padding: 12, marginTop: 4 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' },
  footer: { padding: 20, borderTopWidth: 1 },
  btn: { height: 52, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
