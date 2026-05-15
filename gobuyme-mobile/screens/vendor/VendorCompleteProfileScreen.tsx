import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Image, Modal, Pressable, Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

type Tier = 'TIER_1' | 'TIER_2';

type OptionItem = {
  id: string;
  name: string;
  extraPrice: string;
};

type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  options: OptionItem[];
};

type DocType = 'NIN' | 'DRIVERS_LICENSE' | 'PASSPORT';

const DOC_META: Record<DocType, { label: string; numberLabel: string; placeholder: string; backRequired: boolean }> = {
  NIN: { label: 'NIN', numberLabel: 'NIN', placeholder: '11-digit NIN (e.g. 12345678901)', backRequired: false },
  DRIVERS_LICENSE: { label: "Driver's License", numberLabel: 'License Number', placeholder: 'e.g. ABC123456XY', backRequired: true },
  PASSPORT: { label: 'Passport', numberLabel: 'Passport Number', placeholder: 'e.g. A12345678', backRequired: false },
};

type MenuItemDraft = {
  id: string;
  name: string;
  price: string;
  imageUri: string;
  imageUrl: string;
  optionGroups: OptionGroup[];
};

const PLAN_DETAILS: Record<Tier, {
  title: string;
  bestFor: string;
  features: string[];
  example: string;
}> = {
  TIER_2: {
    title: 'Growth Plan',
    bestFor: 'Vendors starting out or scaling up on GoBuyMe.',
    features: [
      '7.5% commission deducted from each order subtotal',
      'Promotions/Adverts & Analytics',
      'Priority listing in search results',
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: 'On a ₦10,000 order: GoBuyMe earns ₦750 · You receive ₦9,250',
  },
  TIER_1: {
    title: 'Starter Plan',
    bestFor: 'Established vendors with consistent, high order volumes.',
    features: [
      '3% commission deducted from each order subtotal',
      'Full platform access',
      'Secure payment processing via Paystack',
      'Daily payouts processed at 11:30 AM',
      'Dedicated vendor support',
    ],
    example: 'On a ₦10,000 order: GoBuyMe earns ₦300 · You receive ₦9,700',
  },
};

async function uploadImage(uri: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error('Image upload is not configured. Contact support.');
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw new Error('Image upload failed. Please try again.');
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('Image upload failed. Please try again.');
  return data.secure_url;
}

function freshDraft(): MenuItemDraft {
  return { id: Date.now().toString(), name: '', price: '', imageUri: '', imageUrl: '', optionGroups: [] };
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function VendorCompleteProfileScreen() {
  const { theme: T } = useTheme();
  const { updateApprovalStatus } = useAuth();
  const insets = useSafeAreaInsets();

  const [logo, setLogo] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [description, setDescription] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [tier, setTier] = useState<Tier>('TIER_2');
  const [menuItems, setMenuItems] = useState<MenuItemDraft[]>([]);
  const [editingItem, setEditingItem] = useState<MenuItemDraft | null>(null);
  const [isNewItem, setIsNewItem] = useState(true);

  const [docType, setDocType] = useState<DocType | null>(null);
  const [docNumber, setDocNumber] = useState('');
  const [docFrontUri, setDocFrontUri] = useState('');
  const [docFrontUrl, setDocFrontUrl] = useState('');
  const [docBackUri, setDocBackUri] = useState('');
  const [docBackUrl, setDocBackUrl] = useState('');
  const [uploadingDocFront, setUploadingDocFront] = useState(false);
  const [uploadingDocBack, setUploadingDocBack] = useState(false);
  const [bvn, setBvn] = useState('');
  const [selfieUri, setSelfieUri] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  const [modalTier, setModalTier] = useState<Tier | null>(null);
  const [showCoverHint, setShowCoverHint] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNewItem = () => {
    setIsNewItem(true);
    setEditingItem(freshDraft());
  };

  const openEditItem = (item: MenuItemDraft) => {
    setIsNewItem(false);
    setEditingItem(item);
  };

  const handleModalSave = (updated: MenuItemDraft) => {
    setMenuItems(prev =>
      isNewItem ? [...prev, updated] : prev.map(i => i.id === updated.id ? updated : i),
    );
    setEditingItem(null);
  };

  const removeMenuItem = (id: string) => {
    setMenuItems(prev => prev.filter(i => i.id !== id));
  };

  const pickImage = async (type: 'logo' | 'cover') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'logo' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    try {
      type === 'logo' ? setUploadingLogo(true) : setUploadingCover(true);
      const url = await uploadImage(uri);
      type === 'logo' ? setLogo(url) : setCoverImage(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploadingLogo(false);
      setUploadingCover(false);
    }
  };

  const pickSelfie = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setSelfieUri(uri);
    setUploadingSelfie(true);
    try {
      const url = await uploadImage(uri);
      setSelfieUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload selfie. Please try again.');
      setSelfieUri('');
    } finally {
      setUploadingSelfie(false);
    }
  };

  const pickDocumentImage = async (side: 'front' | 'back') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to upload your document.');
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
    if (side === 'front') { setDocFrontUri(uri); setUploadingDocFront(true); }
    else { setDocBackUri(uri); setUploadingDocBack(true); }
    try {
      const url = await uploadImage(uri);
      if (side === 'front') setDocFrontUrl(url);
      else setDocBackUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload the document image. Please try again.');
      if (side === 'front') setDocFrontUri('');
      else setDocBackUri('');
    } finally {
      if (side === 'front') setUploadingDocFront(false);
      else setUploadingDocBack(false);
    }
  };

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please add a short description of your store.');
      return;
    }
    if (!openingTime.trim() || !closingTime.trim()) {
      Alert.alert('Required', 'Please enter your store opening and closing times.');
      return;
    }
    if (!docType) {
      Alert.alert('Required', 'Please select a document type for identity verification.');
      return;
    }
    if (!docNumber.trim()) {
      Alert.alert('Required', `Please enter your ${DOC_META[docType].numberLabel}.`);
      return;
    }
    if (!docFrontUrl) {
      Alert.alert('Required', 'Please upload an image of your document.');
      return;
    }
    try {
      setSaving(true);
      await api.patch('/vendors/me', {
        description: description.trim(),
        logo: logo || null,
        coverImage: coverImage || null,
        openingTime: openingTime.trim(),
        closingTime: closingTime.trim(),
      });
      if (tier === 'TIER_1') {
        await api.patch('/vendors/me/tier', { tier: 'TIER_1' });
      }
      await api.post('/vendors/me/document', {
        type: docType,
        number: docNumber.trim(),
        imageUrl: docFrontUrl,
        imageUrlBack: docBackUrl || null,
        bvn: bvn.trim() || null,
        selfieUrl: selfieUrl || null,
      });
      const validItems = menuItems.filter(
        i => i.name.trim() && i.price.trim() && !isNaN(parseFloat(i.price)),
      );
      await Promise.all(
        validItems.map(i =>
          api.post('/vendors/me/menu', {
            name: i.name.trim(),
            price: parseFloat(i.price),
            image: i.imageUrl || null,
            optionGroups: i.optionGroups
              .filter(g => g.name.trim() && g.options.some(o => o.name.trim()))
              .map(g => ({
                name: g.name.trim(),
                required: g.required,
                options: g.options
                  .filter(o => o.name.trim())
                  .map(o => ({ name: o.name.trim(), extraPrice: parseFloat(o.extraPrice) || 0 })),
              })),
          }),
        ),
      );
      const statusRes = await api.get('/auth/activation-status');
      const { approvalStatus } = statusRes.data.data;
      updateApprovalStatus(approvalStatus);
      if (approvalStatus === 'APPROVED') {
        router.replace('/(vendor)' as never);
      } else {
        router.replace({ pathname: '/account-not-active', params: { role: 'vendor' } } as never);
      }
    } catch {
      Alert.alert('Save failed', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploadingLogo || uploadingCover || uploadingDocFront || uploadingDocBack || uploadingSelfie;
  const modalDetails = modalTier ? PLAN_DETAILS[modalTier] : null;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: T.text }]}>Set up your store</Text>
        <Text style={[styles.sub, { color: T.textSec }]}>
          Complete your profile and choose a commission plan so we can activate your account.
        </Text>

        {/* Cover photo */}
        <SectionLabel label="COVER PHOTO" T={T} onHint={() => setShowCoverHint(true)} />
        <TouchableOpacity
          onPress={() => pickImage('cover')}
          activeOpacity={0.85}
          style={[styles.coverPicker, { backgroundColor: T.surface, borderColor: T.border }]}
        >
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="image-outline" size={32} color={T.textMuted} />
              <Text style={[styles.pickerHint, { color: T.textMuted }]}>Tap to add cover photo</Text>
            </View>
          )}
          {uploadingCover ? (
            <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
              <Ionicons name="camera" size={14} color="#fff" />
              <Text style={styles.cameraChipText}>{coverImage ? 'Change' : 'Add'}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Logo */}
        <SectionLabel label="STORE LOGO" T={T} mt={20} />
        <TouchableOpacity onPress={() => pickImage('logo')} style={styles.logoPicker} activeOpacity={0.85}>
          {logo ? (
            <Image source={{ uri: logo }} style={[styles.logoImg, { borderColor: T.border }]} />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: T.primaryTint, borderColor: T.border }]}>
              <Text style={{ fontSize: 28 }}>🍽️</Text>
            </View>
          )}
          <View style={[styles.logoCameraBtn, { backgroundColor: T.primary }]}>
            {uploadingLogo ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="camera" size={13} color="#fff" />
            )}
          </View>
        </TouchableOpacity>

        {/* Description */}
        <SectionLabel label="ABOUT YOUR STORE *" T={T} mt={24} />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tell customers what makes your store special…"
          placeholderTextColor={T.textMuted}
          multiline
          numberOfLines={4}
          style={[styles.textarea, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
        />

        {/* Hours */}
        <SectionLabel label="OPENING HOURS *" T={T} mt={20} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: T.textSec }]}>Opens at</Text>
            <TextInput
              value={openingTime}
              onChangeText={setOpeningTime}
              placeholder="08:00"
              placeholderTextColor={T.textMuted}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: T.textSec }]}>Closes at</Text>
            <TextInput
              value={closingTime}
              onChangeText={setClosingTime}
              placeholder="22:00"
              placeholderTextColor={T.textMuted}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />
          </View>
        </View>

        {/* Commission tier */}
        <SectionLabel label="COMMISSION PLAN *" T={T} mt={28} />
        <Text style={[styles.subText, { color: T.textSec }]}>
          You can switch plans later from your profile (14-day cooldown applies).
        </Text>
        <View style={styles.tierCards}>
          <TierCard
            selected={tier === 'TIER_2'}
            onPress={() => setTier('TIER_2')}
            onDetails={() => setModalTier('TIER_2')}
            title="Growth Plan"
            badge="RECOMMENDED"
            lines={['7.5% commission per order']}
            T={T}
          />
          <TierCard
            selected={tier === 'TIER_1'}
            onPress={() => setTier('TIER_1')}
            onDetails={() => setModalTier('TIER_1')}
            title="Starter Plan"
            lines={['3% commission per order']}
            T={T}
          />
        </View>

        {/* Identity verification */}
        <SectionLabel label="IDENTITY VERIFICATION *" T={T} mt={28} />
        <Text style={[styles.subText, { color: T.textSec }]}>
          Select a government-issued ID to verify your identity. This is required for account activation.
        </Text>

        {/* Doc type picker */}
        <View style={styles.docTypeRow}>
          {(Object.keys(DOC_META) as DocType[]).map((dt) => (
            <TouchableOpacity
              key={dt}
              onPress={() => { setDocType(dt); setDocNumber(''); setDocFrontUri(''); setDocFrontUrl(''); setDocBackUri(''); setDocBackUrl(''); }}
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

        {docType && (
          <>
            {/* Document number */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 16, marginBottom: 6 }]}>
              {DOC_META[docType].numberLabel} *
            </Text>
            <TextInput
              value={docNumber}
              onChangeText={setDocNumber}
              placeholder={DOC_META[docType].placeholder}
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            {/* Document images */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 16, marginBottom: 8 }]}>
              {DOC_META[docType].backRequired ? 'Front & Back *' : 'Document Image *'}
            </Text>
            <View style={DOC_META[docType].backRequired ? styles.docImgRow : undefined}>
              {/* Front */}
              <TouchableOpacity
                onPress={() => pickDocumentImage('front')}
                activeOpacity={0.85}
                style={[
                  styles.docImgBox,
                  { flex: DOC_META[docType].backRequired ? 1 : undefined, backgroundColor: T.surface, borderColor: T.border },
                ]}
              >
                {docFrontUri ? (
                  <Image source={{ uri: docFrontUri }} style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="id-card-outline" size={26} color={T.textMuted} />
                    <Text style={[styles.pickerHint, { color: T.textMuted }]}>
                      {DOC_META[docType].backRequired ? 'Front' : 'Tap to upload'}
                    </Text>
                  </View>
                )}
                {uploadingDocFront ? (
                  <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : docFrontUri ? (
                  <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
                    <Ionicons name="camera" size={14} color="#fff" />
                    <Text style={styles.cameraChipText}>Change</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {/* Back (Driver's License only) */}
              {DOC_META[docType].backRequired && (
                <TouchableOpacity
                  onPress={() => pickDocumentImage('back')}
                  activeOpacity={0.85}
                  style={[styles.docImgBox, { flex: 1, backgroundColor: T.surface, borderColor: T.border }]}
                >
                  {docBackUri ? (
                    <Image source={{ uri: docBackUri }} style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} resizeMode="cover" />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="id-card-outline" size={26} color={T.textMuted} />
                      <Text style={[styles.pickerHint, { color: T.textMuted }]}>Back</Text>
                    </View>
                  )}
                  {uploadingDocBack ? (
                    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 }]}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : docBackUri ? (
                    <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
                      <Ionicons name="camera" size={14} color="#fff" />
                      <Text style={styles.cameraChipText}>Change</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              )}
            </View>

            {/* BVN */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 16, marginBottom: 6 }]}>
              BVN (Bank Verification Number) — Optional
            </Text>
            <TextInput
              value={bvn}
              onChangeText={setBvn}
              placeholder="11-digit BVN"
              placeholderTextColor={T.textMuted}
              keyboardType="numeric"
              maxLength={11}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            {/* Selfie */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 16, marginBottom: 8 }]}>
              Selfie / Liveness Photo — Optional
            </Text>
            <TouchableOpacity
              onPress={pickSelfie}
              activeOpacity={0.85}
              style={[styles.docImgBox, { backgroundColor: T.surface, borderColor: T.border }]}
            >
              {selfieUri ? (
                <Image source={{ uri: selfieUri }} style={[StyleSheet.absoluteFill, { borderRadius: 4 }]} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="person-circle-outline" size={26} color={T.textMuted} />
                  <Text style={[styles.pickerHint, { color: T.textMuted }]}>Tap to upload a clear selfie</Text>
                </View>
              )}
              {uploadingSelfie ? (
                <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 }]}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : selfieUri ? (
                <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
                  <Ionicons name="camera" size={14} color="#fff" />
                  <Text style={styles.cameraChipText}>Change</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            {/* Privacy note */}
            <View style={[styles.docPrivacyBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Ionicons name="lock-closed-outline" size={13} color={T.textMuted} style={{ marginTop: 1 }} />
              <Text style={[styles.docPrivacyText, { color: T.textMuted }]}>
                Your document is encrypted and used only for identity verification. It will never be shared with third parties.
              </Text>
            </View>
          </>
        )}

        {/* Menu items */}
        <SectionLabel label="MENU ITEMS" T={T} mt={28} />
        <Text style={[styles.subText, { color: T.textSec }]}>
          A well-stocked menu gets approved faster. Add items with options for dishes that come with choices — e.g. soups served with Poundo, Semo, Fufu, or Garri.
        </Text>

        {menuItems.length === 0 ? (
          <View style={[styles.menuEmpty, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Ionicons name="restaurant-outline" size={28} color={T.textMuted} />
            <Text style={[styles.menuEmptyText, { color: T.textMuted }]}>No items added yet</Text>
          </View>
        ) : (
          <View style={styles.menuList}>
            {menuItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onEdit={() => openEditItem(item)}
                onRemove={() => removeMenuItem(item.id)}
                T={T}
              />
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={openNewItem}
          style={[styles.addItemBtn, { borderColor: T.primary }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={T.primary} />
          <Text style={[styles.addItemText, { color: T.primary }]}>Add item</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={busy}
          style={[styles.saveBtn, { backgroundColor: busy ? T.surface3 : T.primary }]}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Plan details modal */}
      <Modal
        visible={modalTier !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModalTier(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalTier(null)} />
          <View style={[styles.modalSheet, { backgroundColor: T.bg }]}>
            <View style={[styles.modalHandle, { backgroundColor: T.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>{modalDetails?.title}</Text>
              <TouchableOpacity onPress={() => setModalTier(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={T.textSec} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalBestFor, { color: T.textSec }]}>Best for: {modalDetails?.bestFor}</Text>
            <View style={[styles.modalDivider, { backgroundColor: T.border }]} />
            <Text style={[styles.modalSectionTitle, { color: T.text }]}>What's included</Text>
            {modalDetails?.features.map((f) => (
              <View key={f} style={styles.modalFeatureRow}>
                <Ionicons name="checkmark-circle" size={16} color={T.primary} style={{ marginTop: 2 }} />
                <Text style={[styles.modalFeatureText, { color: T.textSec }]}>{f}</Text>
              </View>
            ))}
            <View style={[styles.modalExampleBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Text style={[styles.modalExampleLabel, { color: T.textMuted }]}>EXAMPLE</Text>
              <Text style={[styles.modalExampleText, { color: T.text }]}>{modalDetails?.example}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setModalTier(null)}
              style={[styles.modalCloseBtn, { backgroundColor: T.primary }]}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cover photo hint modal */}
      <Modal
        visible={showCoverHint}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCoverHint(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCoverHint(false)} />
          <View style={[styles.modalSheet, { backgroundColor: T.bg }]}>
            <View style={[styles.modalHandle, { backgroundColor: T.border }]} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>Cover Photo Guide</Text>
              <TouchableOpacity onPress={() => setShowCoverHint(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={T.textSec} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalDivider, { backgroundColor: T.border }]} />
            <Text style={[styles.modalSectionTitle, { color: T.text }]}>Recommended dimensions</Text>
            <View style={[styles.modalExampleBox, { backgroundColor: T.surface2 ?? T.surface }]}>
              <Text style={[styles.modalExampleLabel, { color: T.textMuted }]}>SIZE</Text>
              <Text style={[styles.modalExampleText, { color: T.text }]}>1280 × 720 px  ·  16:9 ratio</Text>
              <Text style={[styles.modalExampleLabel, { color: T.textMuted, marginTop: 10 }]}>MINIMUM</Text>
              <Text style={[styles.modalExampleText, { color: T.text }]}>800 × 450 px</Text>
              <Text style={[styles.modalExampleLabel, { color: T.textMuted, marginTop: 10 }]}>FORMAT</Text>
              <Text style={[styles.modalExampleText, { color: T.text }]}>JPG or PNG</Text>
            </View>
            <Text style={[styles.modalSectionTitle, { color: T.text }]}>Tips</Text>
            {[
              'Show your actual food, products, or storefront — not a logo',
              'Use bright, well-lit photos; avoid dark or blurry images',
              'Keep the main subject centred — edges may be cropped on smaller screens',
              'Avoid heavy text overlays; customers scan images quickly',
            ].map((tip) => (
              <View key={tip} style={styles.modalFeatureRow}>
                <Ionicons name="checkmark-circle" size={16} color={T.primary} style={{ marginTop: 2 }} />
                <Text style={[styles.modalFeatureText, { color: T.textSec }]}>{tip}</Text>
              </View>
            ))}
            <TouchableOpacity
              onPress={() => setShowCoverHint(false)}
              style={[styles.modalCloseBtn, { backgroundColor: T.primary, marginTop: 24 }]}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add / edit menu item modal */}
      <AddMenuItemModal
        visible={editingItem !== null}
        initial={editingItem}
        isNew={isNewItem}
        onClose={() => setEditingItem(null)}
        onSave={handleModalSave}
        T={T}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ label, T, mt, onHint }: { label: string; T: any; mt?: number; onHint?: () => void }) {
  return (
    <View style={[styles.sectionLabelRow, { marginTop: mt ?? 0, marginBottom: 8 }]}>
      <Text style={[styles.sectionLabel, { color: T.textSec }]}>{label}</Text>
      {onHint && (
        <TouchableOpacity onPress={onHint} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={[styles.hintLink, { color: T.primary }]}>Hint</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── TierCard ─────────────────────────────────────────────────────────────────

function TierCard({
  selected, onPress, onDetails, title, badge, lines, T,
}: {
  selected: boolean; onPress: () => void; onDetails: () => void;
  title: string; badge?: string; lines: string[]; T: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.tierCard, { backgroundColor: T.surface, borderColor: selected ? T.primary : T.border, borderWidth: selected ? 2 : 1 }]}
    >
      <View style={styles.tierCardHeader}>
        <View style={styles.tierCardLeft}>
          <Text style={[styles.tierCardTitle, { color: T.text }]}>{title}</Text>
          {badge && (
            <View style={[styles.badge, { backgroundColor: T.primaryTint }]}>
              <Text style={[styles.badgeText, { color: T.primary }]}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={[styles.radio, { borderColor: selected ? T.primary : T.border }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: T.primary }]} />}
        </View>
      </View>
      {lines.map((line) => (
        <Text key={line} style={[styles.tierItem, { color: T.textSec }]}>{`✓ ${line}`}</Text>
      ))}
      <TouchableOpacity onPress={onDetails} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.planDetailsBtn}>
        <Text style={[styles.planDetailsText, { color: T.primary }]}>Plan details</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── MenuItemCard ─────────────────────────────────────────────────────────────

function MenuItemCard({
  item, onEdit, onRemove, T,
}: {
  item: MenuItemDraft; onEdit: () => void; onRemove: () => void; T: any;
}) {
  const namedGroups = item.optionGroups.filter(g => g.name.trim()).length;
  return (
    <TouchableOpacity
      onPress={onEdit}
      activeOpacity={0.85}
      style={[styles.menuCard, { backgroundColor: T.surface, borderColor: T.border }]}
    >
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={[styles.menuCardImg, { borderColor: T.border }]} resizeMode="cover" />
      ) : (
        <View style={[styles.menuCardImg, { backgroundColor: T.primaryTint, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="fast-food-outline" size={20} color={T.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuCardName, { color: T.text }]} numberOfLines={1}>
          {item.name.trim() || 'Unnamed item'}
        </Text>
        <Text style={[styles.menuCardMeta, { color: T.textSec }]}>
          {item.price ? `₦${parseFloat(item.price).toLocaleString()}` : 'No price set'}
          {namedGroups > 0 ? `  ·  ${namedGroups} option group${namedGroups > 1 ? 's' : ''}` : ''}
        </Text>
      </View>
      <View style={styles.menuCardActions}>
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="create-outline" size={18} color={T.textSec} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={17} color={T.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── AddMenuItemModal ─────────────────────────────────────────────────────────

function AddMenuItemModal({
  visible, initial, isNew, onClose, onSave, T, bottomInset,
}: {
  visible: boolean;
  initial: MenuItemDraft | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (item: MenuItemDraft) => void;
  T: any;
  bottomInset: number;
}) {
  const [draft, setDraft] = useState<MenuItemDraft>(freshDraft());
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) setDraft(initial ?? freshDraft());
  }, [visible, initial?.id]);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setDraft(prev => ({ ...prev, imageUri: uri }));
    setUploading(true);
    try {
      const url = await uploadImage(uri);
      setDraft(prev => ({ ...prev, imageUrl: url }));
    } catch {
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const addGroup = () => {
    const group: OptionGroup = {
      id: Date.now().toString(),
      name: '',
      required: false,
      options: [{ id: `${Date.now()}o`, name: '', extraPrice: '' }],
    };
    setDraft(prev => ({ ...prev, optionGroups: [...prev.optionGroups, group] }));
  };

  const removeGroup = (gid: string) =>
    setDraft(prev => ({ ...prev, optionGroups: prev.optionGroups.filter(g => g.id !== gid) }));

  const updateGroupName = (gid: string, name: string) =>
    setDraft(prev => ({ ...prev, optionGroups: prev.optionGroups.map(g => g.id === gid ? { ...g, name } : g) }));

  const updateGroupRequired = (gid: string, required: boolean) =>
    setDraft(prev => ({ ...prev, optionGroups: prev.optionGroups.map(g => g.id === gid ? { ...g, required } : g) }));

  const addOption = (gid: string) => {
    const opt: OptionItem = { id: `${Date.now()}oi`, name: '', extraPrice: '' };
    setDraft(prev => ({
      ...prev,
      optionGroups: prev.optionGroups.map(g => g.id === gid ? { ...g, options: [...g.options, opt] } : g),
    }));
  };

  const removeOption = (gid: string, oid: string) =>
    setDraft(prev => ({
      ...prev,
      optionGroups: prev.optionGroups.map(g =>
        g.id === gid ? { ...g, options: g.options.filter(o => o.id !== oid) } : g,
      ),
    }));

  const updateOption = (gid: string, oid: string, field: 'name' | 'extraPrice', value: string) =>
    setDraft(prev => ({
      ...prev,
      optionGroups: prev.optionGroups.map(g =>
        g.id === gid
          ? { ...g, options: g.options.map(o => o.id === oid ? { ...o, [field]: value } : o) }
          : g,
      ),
    }));

  const handleSave = () => {
    if (!draft.name.trim()) {
      Alert.alert('Required', 'Please enter a name for this item.');
      return;
    }
    if (!draft.price.trim() || isNaN(parseFloat(draft.price))) {
      Alert.alert('Required', 'Please enter a valid price.');
      return;
    }
    onSave(draft);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.itemModalSheet, { backgroundColor: T.bg }]}>
          <View style={[styles.modalHandle, { backgroundColor: T.border }]} />

          {/* Header */}
          <View style={[styles.modalHeader, { paddingHorizontal: 24, paddingBottom: 16 }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>{isNew ? 'Add Menu Item' : 'Edit Item'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={T.textSec} />
            </TouchableOpacity>
          </View>
          <View style={[styles.modalDivider, { backgroundColor: T.border }]} />

          <ScrollView
            contentContainerStyle={styles.itemModalScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Photo */}
            <TouchableOpacity
              onPress={pickPhoto}
              style={[styles.itemPhoto, { backgroundColor: T.primaryTint, borderColor: T.border }]}
            >
              {draft.imageUri ? (
                <Image source={{ uri: draft.imageUri }} style={[StyleSheet.absoluteFill, { borderRadius: 8 }]} resizeMode="cover" />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="camera-outline" size={28} color={T.textMuted} />
                  <Text style={[styles.pickerHint, { color: T.textMuted }]}>Add photo</Text>
                </View>
              )}
              {uploading && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              {!uploading && draft.imageUri && (
                <View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
                  <Ionicons name="camera" size={14} color="#fff" />
                  <Text style={styles.cameraChipText}>Change</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Name */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 20, marginBottom: 6 }]}>Item Name *</Text>
            <TextInput
              value={draft.name}
              onChangeText={(v) => setDraft(prev => ({ ...prev, name: v }))}
              placeholder="e.g. Egusi Soup"
              placeholderTextColor={T.textMuted}
              style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
            />

            {/* Price */}
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 16, marginBottom: 6 }]}>Base Price *</Text>
            <View style={[styles.priceInputRow, { backgroundColor: T.surface, borderColor: T.border }]}>
              <Text style={[styles.priceCurrency, { color: T.textSec }]}>₦</Text>
              <TextInput
                value={draft.price}
                onChangeText={(v) => setDraft(prev => ({ ...prev, price: v }))}
                placeholder="0.00"
                placeholderTextColor={T.textMuted}
                keyboardType="decimal-pad"
                style={[styles.priceTextInput, { color: T.text }]}
              />
            </View>

            {/* Options divider */}
            <View style={[styles.modalDivider, { backgroundColor: T.border, marginVertical: 24 }]} />
            <Text style={[styles.modalSectionTitle, { color: T.text, marginBottom: 4 }]}>Options</Text>
            <Text style={[styles.subText, { color: T.textSec, marginBottom: draft.optionGroups.length > 0 ? 16 : 12 }]}>
              Add option groups for items that come with choices — e.g. soups served with different swallows.
            </Text>

            {draft.optionGroups.map((group) => (
              <View key={group.id} style={[styles.optionGroupCard, { backgroundColor: T.surface, borderColor: T.border }]}>
                {/* Group name + delete */}
                <View style={styles.optionGroupTop}>
                  <TextInput
                    value={group.name}
                    onChangeText={(v) => updateGroupName(group.id, v)}
                    placeholder="Group name (e.g. Choice of Swallow)"
                    placeholderTextColor={T.textMuted}
                    style={[styles.optionGroupNameInput, { flex: 1, backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
                  />
                  <TouchableOpacity
                    onPress={() => removeGroup(group.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 10 }}
                  >
                    <Ionicons name="close-circle-outline" size={22} color={T.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Required toggle */}
                <View style={styles.requiredRow}>
                  <Text style={[styles.requiredLabel, { color: T.textSec }]}>Required</Text>
                  <Switch
                    value={group.required}
                    onValueChange={(v) => updateGroupRequired(group.id, v)}
                    trackColor={{ false: T.border, true: T.primary }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Option items */}
                {group.options.map((opt, oi) => (
                  <View key={opt.id} style={styles.optionRow}>
                    <TextInput
                      value={opt.name}
                      onChangeText={(v) => updateOption(group.id, opt.id, 'name', v)}
                      placeholder={`Option ${oi + 1} (e.g. Poundo Yam)`}
                      placeholderTextColor={T.textMuted}
                      style={[styles.optionNameInput, { flex: 1, backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
                    />
                    <View style={[styles.optionPriceBox, { backgroundColor: T.bg, borderColor: T.border }]}>
                      <Text style={[styles.optionPricePrefix, { color: T.textMuted }]}>+₦</Text>
                      <TextInput
                        value={opt.extraPrice}
                        onChangeText={(v) => updateOption(group.id, opt.id, 'extraPrice', v)}
                        placeholder="0"
                        placeholderTextColor={T.textMuted}
                        keyboardType="decimal-pad"
                        style={[styles.optionPriceInput, { color: T.text }]}
                      />
                    </View>
                    {group.options.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeOption(group.id, opt.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="remove-circle-outline" size={20} color={T.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity onPress={() => addOption(group.id)} style={styles.addOptionBtn}>
                  <Ionicons name="add" size={14} color={T.primary} />
                  <Text style={[styles.addOptionText, { color: T.primary }]}>Add option</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              onPress={addGroup}
              style={[styles.addItemBtn, { borderColor: T.primary, marginTop: draft.optionGroups.length > 0 ? 8 : 0 }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={T.primary} />
              <Text style={[styles.addItemText, { color: T.primary }]}>Add option group</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Save */}
          <View style={[styles.footer, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: bottomInset + 16 }]}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={uploading}
              style={[styles.saveBtn, { backgroundColor: uploading ? T.surface3 : T.primary }]}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>{isNew ? 'Add to Menu' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { padding: 24 },
  heading: {
    fontSize: 26, fontWeight: '800', letterSpacing: -0.5,
    fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 10,
  },
  sub: {
    fontSize: 14, lineHeight: 22,
    fontFamily: 'PlusJakartaSans_400Regular', marginBottom: 28,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  hintLink: {
    fontSize: 12, fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold', textDecorationLine: 'underline',
  },
  subText: {
    fontSize: 13, lineHeight: 20, marginBottom: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  coverPicker: {
    height: 140, borderRadius: 4, borderWidth: 1,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholder: { alignItems: 'center', gap: 8 },
  pickerHint: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  overlay: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  cameraChip: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 4, paddingVertical: 5, paddingHorizontal: 10,
  },
  cameraChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  logoPicker: { alignSelf: 'flex-start', marginBottom: 4 },
  logoImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
  logoPlaceholder: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  logoCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  textarea: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingTop: 12,
    fontSize: 14, minHeight: 96, textAlignVertical: 'top',
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  row: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  input: { height: 48, borderRadius: 4, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  // Tier
  tierCards: { gap: 12 },
  tierCard: { padding: 16, borderRadius: 4, gap: 6 },
  tierCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  tierCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  tierCardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  tierItem: { fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_400Regular' },
  planDetailsBtn: { alignSelf: 'flex-start', marginTop: 4 },
  planDetailsText: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', textDecorationLine: 'underline' },
  // Document
  docTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  docTypeChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 4, borderWidth: 1,
  },
  docTypeChipText: { fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  docImgRow: { flexDirection: 'row', gap: 10 },
  docImgBox: {
    height: 110, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    marginBottom: 10,
  },
  docPrivacyBox: { flexDirection: 'row', gap: 8, borderRadius: 4, padding: 12, marginTop: 4 },
  docPrivacyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' },
  // Menu list
  menuEmpty: {
    height: 96, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
  },
  menuEmptyText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  menuList: { gap: 8, marginBottom: 10 },
  menuCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 4, borderWidth: 1, padding: 12,
  },
  menuCardImg: { width: 52, height: 52, borderRadius: 4, borderWidth: 1 },
  menuCardName: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold', marginBottom: 3 },
  menuCardMeta: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' },
  menuCardActions: { flexDirection: 'row', gap: 14 },
  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 4, paddingVertical: 12,
  },
  addItemText: { fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  // Footer
  footer: { padding: 20, borderTopWidth: 1 },
  saveBtn: { height: 52, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  // Modals shared
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
  modalBestFor: { fontSize: 13, lineHeight: 20, marginBottom: 20, fontFamily: 'PlusJakartaSans_400Regular' },
  modalDivider: { height: 1, marginBottom: 16 },
  modalSectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12, fontFamily: 'PlusJakartaSans_700Bold' },
  modalFeatureRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modalFeatureText: { fontSize: 14, lineHeight: 20, flex: 1, fontFamily: 'PlusJakartaSans_400Regular' },
  modalExampleBox: { borderRadius: 4, padding: 14, marginTop: 4, marginBottom: 24, gap: 4 },
  modalExampleLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_700Bold' },
  modalExampleText: { fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_400Regular' },
  modalCloseBtn: { height: 50, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
  // Item modal
  itemModalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', overflow: 'hidden' },
  itemModalScroll: { padding: 24, paddingBottom: 8 },
  itemPhoto: {
    height: 140, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  priceInputRow: {
    height: 48, borderRadius: 4, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 4,
  },
  priceCurrency: { fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  priceTextInput: { flex: 1, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
  // Option groups
  optionGroupCard: {
    borderRadius: 4, borderWidth: 1, padding: 14,
    gap: 10, marginBottom: 10,
  },
  optionGroupTop: { flexDirection: 'row', alignItems: 'center' },
  optionGroupNameInput: {
    height: 40, borderRadius: 4, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  requiredRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  requiredLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionNameInput: {
    height: 40, borderRadius: 4, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  optionPriceBox: {
    flexDirection: 'row', alignItems: 'center',
    height: 40, borderRadius: 4, borderWidth: 1,
    paddingHorizontal: 8, gap: 2,
  },
  optionPricePrefix: { fontSize: 11, fontFamily: 'PlusJakartaSans_400Regular' },
  optionPriceInput: { width: 44, fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingVertical: 4,
  },
  addOptionText: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
});
