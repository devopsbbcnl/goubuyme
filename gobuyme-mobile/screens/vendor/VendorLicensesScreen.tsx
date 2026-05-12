import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, Modal, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
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

type LicenseType = 'NAFDAC' | 'PHARMACIST' | 'FOOD_HANDLER' | 'BUSINESS_PERMIT' | 'IMPORT_PERMIT';
type LicenseStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

interface License {
  id: string;
  type: LicenseType;
  licenseNumber: string;
  imageUrl: string;
  expiresAt: string | null;
  status: LicenseStatus;
  reviewNote: string | null;
}

const LICENSE_META: Record<LicenseType, { label: string; placeholder: string }> = {
  NAFDAC:         { label: 'NAFDAC Registration',     placeholder: 'e.g. A7-1234' },
  PHARMACIST:     { label: 'Pharmacist License',       placeholder: 'e.g. PCN/2024/12345' },
  FOOD_HANDLER:   { label: 'Food Handler Permit',      placeholder: 'e.g. FH-2024-001' },
  BUSINESS_PERMIT:{ label: 'Business Operating Permit',placeholder: 'e.g. BOP-RC-001' },
  IMPORT_PERMIT:  { label: 'Import / Trade Permit',    placeholder: 'e.g. NEPC/2024/001' },
};

const STATUS_META: Record<LicenseStatus, { color: string; icon: string; label: string }> = {
  PENDING:  { color: '#F5A623', icon: 'time-outline',     label: 'Pending' },
  VERIFIED: { color: '#1A9E5F', icon: 'checkmark-circle', label: 'Verified' },
  REJECTED: { color: '#E23B3B', icon: 'close-circle',     label: 'Rejected' },
  EXPIRED:  { color: '#8A8A8A', icon: 'alert-circle',     label: 'Expired' },
};

export default function VendorLicensesScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [licType, setLicType] = useState<LicenseType>('NAFDAC');
  const [licNumber, setLicNumber] = useState('');
  const [licImageUri, setLicImageUri] = useState('');
  const [licImageUrl, setLicImageUrl] = useState('');
  const [uploadingLic, setUploadingLic] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendors/me/licenses');
      setLicenses(res.data.data ?? []);
    } catch {
      setLicenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchLicenses(); }, [fetchLicenses]));

  const resetForm = () => {
    setLicType('NAFDAC');
    setLicNumber('');
    setLicImageUri('');
    setLicImageUrl('');
    setExpiresAt('');
  };

  const pickLicImage = async () => {
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
    setLicImageUri(uri);
    setUploadingLic(true);
    try {
      const url = await uploadImage(uri);
      setLicImageUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload image. Please try again.');
      setLicImageUri('');
    } finally {
      setUploadingLic(false);
    }
  };

  const handleAdd = async () => {
    if (!licNumber.trim()) {
      Alert.alert('Required', 'Please enter the license number.');
      return;
    }
    if (!licImageUrl) {
      Alert.alert('Required', 'Please upload an image of your license.');
      return;
    }
    try {
      setAdding(true);
      await api.post('/vendors/me/licenses', {
        type: licType,
        licenseNumber: licNumber.trim(),
        imageUrl: licImageUrl,
        expiresAt: expiresAt.trim() || null,
      });
      setShowAdd(false);
      resetForm();
      fetchLicenses();
    } catch {
      Alert.alert('Failed', 'Could not submit license. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete License', 'Remove this license from your profile?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/vendors/me/licenses/${id}`);
            setLicenses(prev => prev.filter(l => l.id !== id));
          } catch {
            Alert.alert('Failed', 'Could not delete license.');
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={T.text} />
          </TouchableOpacity>
          <Text style={[styles.heading, { color: T.text }]}>Licenses & Permits</Text>
          <TouchableOpacity
            onPress={() => setShowAdd(true)}
            style={[styles.addBtn, { backgroundColor: T.primary }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sub, { color: T.textSec }]}>
          Required for pharmacies, NAFDAC-regulated products, and high-risk food categories. Verified licenses unlock the Premium Verified badge.
        </Text>

        {loading ? (
          <ActivityIndicator color={T.primary} style={{ marginTop: 40 }} />
        ) : licenses.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Ionicons name="document-text-outline" size={32} color={T.textMuted} />
            <Text style={[styles.emptyText, { color: T.textMuted }]}>No licenses added yet</Text>
            <Text style={[styles.emptySub, { color: T.textMuted }]}>Tap Add to submit a license for review</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {licenses.map(lic => {
              const s = STATUS_META[lic.status];
              return (
                <View key={lic.id} style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardType, { color: T.text }]}>{LICENSE_META[lic.type].label}</Text>
                      <Text style={[styles.cardNumber, { color: T.textSec }]}>{lic.licenseNumber}</Text>
                      {lic.expiresAt && (
                        <Text style={[styles.cardExpiry, { color: T.textMuted }]}>
                          Expires {new Date(lic.expiresAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 8 }}>
                      <View style={[styles.statusPill, { backgroundColor: s.color + '18' }]}>
                        <Ionicons name={s.icon as any} size={12} color={s.color} />
                        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                      </View>
                      {lic.status !== 'VERIFIED' && (
                        <TouchableOpacity onPress={() => handleDelete(lic.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Ionicons name="trash-outline" size={17} color={T.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  {lic.reviewNote && (
                    <Text style={[styles.reviewNote, { color: T.textSec }]}>Note: {lic.reviewNote}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add License Modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAdd(false)} />
          <View style={[styles.modalSheet, { backgroundColor: T.bg }]}>
            <View style={[styles.handle, { backgroundColor: T.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>Add License</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={T.textSec} />
              </TouchableOpacity>
            </View>
            <View style={[{ height: 1, backgroundColor: T.border, marginBottom: 20 }]} />

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Type picker */}
              <Text style={[styles.label, { color: T.textSec }]}>License Type *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {(Object.keys(LICENSE_META) as LicenseType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setLicType(t)}
                    style={[
                      styles.chip,
                      { backgroundColor: licType === t ? T.primary : T.surface, borderColor: licType === t ? T.primary : T.border },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: licType === t ? '#fff' : T.textSec }]}>
                      {LICENSE_META[t].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* License number */}
              <Text style={[styles.label, { color: T.textSec }]}>License Number *</Text>
              <TextInput
                value={licNumber}
                onChangeText={setLicNumber}
                placeholder={LICENSE_META[licType].placeholder}
                placeholderTextColor={T.textMuted}
                autoCapitalize="characters"
                style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
              />

              {/* License image */}
              <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>License Image *</Text>
              <TouchableOpacity
                onPress={pickLicImage}
                activeOpacity={0.85}
                style={[styles.docImgBox, { backgroundColor: T.surface, borderColor: T.border }]}
              >
                {licImageUri || licImageUrl ? (
                  <Image
                    source={{ uri: licImageUri || licImageUrl }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 4 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="cloud-upload-outline" size={26} color={T.textMuted} />
                    <Text style={[styles.pickerHint, { color: T.textMuted }]}>Tap to upload</Text>
                  </View>
                )}
                {uploadingLic ? (
                  <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : (licImageUri || licImageUrl) ? (
                  <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
                    <Ionicons name="camera" size={13} color="#fff" />
                    <Text style={styles.cameraChipText}>Change</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {/* Expiry date */}
              <Text style={[styles.label, { color: T.textSec, marginTop: 14 }]}>Expiry Date — Optional</Text>
              <TextInput
                value={expiresAt}
                onChangeText={setExpiresAt}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={T.textMuted}
                keyboardType="numeric"
                style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
              />

              <View style={{ height: 24 }} />

              <TouchableOpacity
                onPress={handleAdd}
                disabled={adding || uploadingLic}
                style={[styles.submitBtn, { backgroundColor: (adding || uploadingLic) ? T.surface3 : T.primary }]}
                activeOpacity={0.85}
              >
                {adding ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit License</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  heading: { flex: 1, fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  sub: { fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 20 },
  empty: { borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', textAlign: 'center' },
  list: { gap: 10 },
  card: { borderRadius: 4, borderWidth: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardType: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 2 },
  cardNumber: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  cardExpiry: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  reviewNote: { fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
  label: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 6 },
  chip: { marginRight: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  input: { height: 48, borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  docImgBox: {
    height: 110, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  pickerHint: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  cameraChip: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8,
  },
  cameraChipText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  submitBtn: { height: 52, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
