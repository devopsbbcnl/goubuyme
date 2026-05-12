import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Modal, TextInput, Alert,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadows } from '@/theme';
import api from '@/services/api';

// Recommended dimensions for graphic designers — matches the customer homescreen
// carousel card at ~1.86:1 aspect ratio.
const PROMO_DIMENSIONS = { width: 1080, height: 580 };

interface Vendor {
  commissionTier: 'TIER_1' | 'TIER_2';
  businessName: string;
}

interface Promo {
  id: string;
  title: string;
  imageUrl: string;
  code: string | null;
  isActive: boolean;
  createdAt: string;
}

async function uploadToCloudinary(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: 'promo.jpg' } as any);
  formData.append('upload_preset', 'gobuyme_unsigned');
  const res = await fetch('https://api.cloudinary.com/v1_1/gobuyme/image/upload', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const data = await res.json();
  return data.secure_url;
}

export default function VendorPromotionsScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const isTier2 = vendor?.commissionTier === 'TIER_2';

  const loadData = useCallback(async () => {
    try {
      const [vRes, pRes] = await Promise.all([
        api.get('/vendors/me'),
        api.get('/vendors/me/promotions'),
      ]);
      setVendor(vRes.data.data);
      setPromos(pRes.data.data ?? []);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to upload a promo image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [PROMO_DIMENSIONS.width, PROMO_DIMENSIONS.height],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const resetForm = () => {
    setTitle('');
    setCode('');
    setImageUri(null);
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a promotion title.'); return; }
    if (!imageUri) { Alert.alert('Required', 'Please upload a promo image.'); return; }

    setSaving(true);
    try {
      setUploadingImage(true);
      const imageUrl = await uploadToCloudinary(imageUri);
      setUploadingImage(false);

      await api.post('/vendors/me/promotions', {
        title: title.trim(),
        imageUrl,
        code: code.trim() || undefined,
      });

      resetForm();
      setModalVisible(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not create promotion.');
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleToggle = async (promo: Promo) => {
    setTogglingId(promo.id);
    try {
      await api.patch(`/vendors/me/promotions/${promo.id}/toggle`);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'Could not update promotion.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (promo: Promo) => {
    Alert.alert(
      'Delete Promotion',
      `Are you sure you want to delete "${promo.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/vendors/me/promotions/${promo.id}`);
              await loadData();
            } catch {
              Alert.alert('Error', 'Could not delete promotion.');
            }
          },
        },
      ],
    );
  };

  const handleAddPress = () => {
    if (!isTier2) {
      Alert.alert(
        'Growth Plan Required',
        'Your current plan (Standard) does not support promotions. Upgrade to the Growth Plan (Tier 2) to create and manage promo cards that appear in the customer app.',
        [{ text: 'OK' }],
      );
      return;
    }
    resetForm();
    setModalVisible(true);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Promotions</Text>
        <TouchableOpacity
          onPress={handleAddPress}
          style={[
            styles.addBtn,
            { backgroundColor: isTier2 ? T.primary : T.surface2, borderColor: T.border },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color={isTier2 ? '#fff' : T.textMuted} />
          <Text style={[styles.addBtnText, { color: isTier2 ? '#fff' : T.textMuted }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Tier banner */}
        <View style={[
          styles.tierBanner,
          { backgroundColor: isTier2 ? '#FF521B18' : T.surface, borderColor: isTier2 ? '#FF521B40' : T.border },
        ]}>
          <View style={[styles.tierPill, { backgroundColor: isTier2 ? T.primary : '#888' }]}>
            <Text style={styles.tierPillText}>{isTier2 ? 'Growth Plan' : 'Standard Plan'}</Text>
          </View>
          <Text style={[styles.tierInfo, { color: T.textSec }]}>
            {isTier2
              ? 'You can create promo cards that appear in the customer app homescreen carousel.'
              : 'Upgrade to the Growth Plan to create promotions visible to customers on the homescreen.'}
          </Text>
        </View>

        {/* Image spec guide (Tier 2 only) */}
        {isTier2 && (
          <View style={[styles.specCard, { backgroundColor: T.surface, borderColor: T.border }]}>
            <View style={styles.specHeader}>
              <Ionicons name="image-outline" size={18} color={T.primary} />
              <Text style={[styles.specTitle, { color: T.text }]}>Promo Image Guidelines</Text>
            </View>
            <Text style={[styles.specLine, { color: T.textSec }]}>
              Share these specs with your graphic designer:
            </Text>
            <View style={styles.specGrid}>
              {[
                { label: 'Dimensions', value: `${PROMO_DIMENSIONS.width} × ${PROMO_DIMENSIONS.height} px` },
                { label: 'Aspect ratio', value: '1.86 : 1  (landscape)' },
                { label: 'Format', value: 'JPG or PNG' },
                { label: 'Max file size', value: '5 MB' },
                { label: 'Safe zone', value: 'Keep key text 60 px from all edges' },
              ].map(row => (
                <View key={row.label} style={[styles.specRow, { borderBottomColor: T.border }]}>
                  <Text style={[styles.specLabel, { color: T.textMuted }]}>{row.label}</Text>
                  <Text style={[styles.specValue, { color: T.text }]}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Promotions list */}
        {promos.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: T.text }]}>No promotions yet</Text>
            <Text style={[styles.emptySub, { color: T.textSec }]}>
              {isTier2
                ? 'Tap "Add" to create your first promo card.'
                : 'Upgrade to the Growth Plan to start creating promotions.'}
            </Text>
          </View>
        ) : (
          promos.map(promo => (
            <View
              key={promo.id}
              style={[
                styles.promoCard,
                { backgroundColor: T.surface, borderColor: promo.isActive ? T.primary : T.border, ...shadows.card },
              ]}
            >
              {/* Active badge */}
              {promo.isActive && (
                <View style={[styles.activeBadge, { backgroundColor: T.primary }]}>
                  <Text style={styles.activeBadgeText}>LIVE</Text>
                </View>
              )}

              {/* Promo image */}
              <Image source={{ uri: promo.imageUrl }} style={styles.promoImage} resizeMode="cover" />

              <View style={styles.promoBody}>
                <Text style={[styles.promoTitle, { color: T.text }]} numberOfLines={1}>{promo.title}</Text>
                {promo.code && (
                  <View style={[styles.codeTag, { backgroundColor: T.primaryTint }]}>
                    <Text style={[styles.codeTagText, { color: T.primary }]}>Code: {promo.code}</Text>
                  </View>
                )}
                <Text style={[styles.promoDate, { color: T.textMuted }]}>
                  Created {new Date(promo.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>

              {/* Actions */}
              <View style={[styles.promoActions, { borderTopColor: T.border }]}>
                <TouchableOpacity
                  onPress={() => handleToggle(promo)}
                  disabled={!isTier2 || togglingId === promo.id}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: promo.isActive ? '#1A9E5F18' : T.primaryTint,
                      borderColor: promo.isActive ? '#1A9E5F40' : T.primary + '40',
                      opacity: isTier2 ? 1 : 0.4,
                    },
                  ]}
                >
                  {togglingId === promo.id
                    ? <ActivityIndicator size="small" color={T.primary} />
                    : (
                      <Text style={[styles.actionBtnText, { color: promo.isActive ? '#1A9E5F' : T.primary }]}>
                        {promo.isActive ? 'Deactivate' : 'Set Active'}
                      </Text>
                    )
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDelete(promo)}
                  style={[styles.actionBtn, { backgroundColor: '#E23B3B18', borderColor: '#E23B3B40' }]}
                >
                  <Text style={[styles.actionBtnText, { color: '#E23B3B' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create promo modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => !saving && setModalVisible(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: T.text }]}>New Promotion</Text>

            {/* Image picker */}
            <TouchableOpacity
              onPress={pickImage}
              disabled={saving}
              style={[styles.imagePicker, { backgroundColor: T.surface2, borderColor: T.border }]}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={32} color={T.textMuted} />
                  <Text style={[styles.imagePlaceholderText, { color: T.textMuted }]}>
                    Tap to upload promo image
                  </Text>
                  <Text style={[styles.imageDimNote, { color: T.textMuted }]}>
                    Recommended: {PROMO_DIMENSIONS.width} × {PROMO_DIMENSIONS.height} px
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { color: T.textSec }]}>Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Get 20% off your next order"
              placeholderTextColor={T.textMuted}
              style={[styles.input, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
              editable={!saving}
            />

            <Text style={[styles.fieldLabel, { color: T.textSec }]}>Promo Code (optional)</Text>
            <TextInput
              value={code}
              onChangeText={t => setCode(t.toUpperCase())}
              placeholder="e.g. SAVE20"
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              style={[styles.input, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
              editable={!saving}
            />

            <TouchableOpacity
              onPress={handleCreate}
              disabled={saving}
              style={[styles.submitBtn, { backgroundColor: saving ? T.surface3 : T.primary }]}
              activeOpacity={0.85}
            >
              {saving ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {uploadingImage ? 'Uploading image…' : 'Saving…'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Create Promotion</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle:     { fontSize: 18, fontWeight: '800' },
  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1 },
  addBtnText:      { fontSize: 13, fontWeight: '700' },
  scroll:          { padding: 20, paddingBottom: 60 },
  tierBanner:      { borderRadius: 4, borderWidth: 1, padding: 14, marginBottom: 16, gap: 8 },
  tierPill:        { alignSelf: 'flex-start', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 },
  tierPillText:    { fontSize: 11, fontWeight: '700', color: '#fff' },
  tierInfo:        { fontSize: 13, lineHeight: 19 },
  specCard:        { borderRadius: 4, borderWidth: 1, padding: 14, marginBottom: 20 },
  specHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  specTitle:       { fontSize: 14, fontWeight: '700' },
  specLine:        { fontSize: 12, marginBottom: 10 },
  specGrid:        { gap: 0 },
  specRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  specLabel:       { fontSize: 12 },
  specValue:       { fontSize: 12, fontWeight: '600' },
  empty:           { borderRadius: 4, borderWidth: 1, alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle:      { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptySub:        { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  promoCard:       { borderRadius: 4, borderWidth: 1.5, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  activeBadge:     { position: 'absolute', top: 10, right: 10, zIndex: 10, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 8 },
  activeBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  promoImage:      { width: '100%', height: 160 },
  promoBody:       { padding: 12, gap: 6 },
  promoTitle:      { fontSize: 14, fontWeight: '700' },
  codeTag:         { alignSelf: 'flex-start', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 8 },
  codeTagText:     { fontSize: 11, fontWeight: '700' },
  promoDate:       { fontSize: 11 },
  promoActions:    { flexDirection: 'row', gap: 10, padding: 12, paddingTop: 10, borderTopWidth: 1 },
  actionBtn:       { flex: 1, borderRadius: 4, borderWidth: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  actionBtnText:   { fontSize: 12, fontWeight: '700' },
  // Modal
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalWrap:       { justifyContent: 'flex-end' },
  modalSheet:      { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, gap: 12 },
  modalHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 6 },
  modalTitle:      { fontSize: 17, fontWeight: '800' },
  imagePicker:     { borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', overflow: 'hidden', marginBottom: 4 },
  imagePreview:    { width: '100%', height: 160 },
  imagePlaceholder:{ alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 6 },
  imagePlaceholderText: { fontSize: 13, fontWeight: '600' },
  imageDimNote:    { fontSize: 11 },
  fieldLabel:      { fontSize: 12, fontWeight: '600', marginBottom: -4 },
  input:           { borderWidth: 1, borderRadius: 4, padding: 12, fontSize: 14 },
  submitBtn:       { borderRadius: 4, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
