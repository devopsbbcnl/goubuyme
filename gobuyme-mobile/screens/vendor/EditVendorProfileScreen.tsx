import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	TextInput,
	ActivityIndicator,
	Alert,
	Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
		{
			method: 'POST',
			body: form,
		},
	);
	if (!res.ok) throw new Error('Upload failed');
	return ((await res.json()) as { secure_url: string }).secure_url;
}

export default function EditVendorProfileScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();

	const [businessName, setBusinessName] = useState('');
	const [description, setDescription] = useState('');
	const [address, setAddress] = useState('');
	const [city, setCity] = useState('');
	const [stateVal, setStateVal] = useState('Rivers');
	const [openingTime, setOpeningTime] = useState('');
	const [closingTime, setClosingTime] = useState('');
	const [avgDeliveryTime, setAvgDeliveryTime] = useState('');
	const [logo, setLogo] = useState('');
	const [coverImage, setCoverImage] = useState('');

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [uploadingLogo, setUploadingLogo] = useState(false);
	const [uploadingCover, setUploadingCover] = useState(false);

	const loadProfile = useCallback(async () => {
		try {
			const res = await api.get('/vendors/me');
			const v = res.data.data;
			setBusinessName(v.businessName ?? '');
			setDescription(v.description ?? '');
			setAddress(v.address ?? '');
			setCity(v.city ?? '');
			setStateVal(v.state ?? 'Rivers');
			setOpeningTime(v.openingTime ?? '');
			setClosingTime(v.closingTime ?? '');
			setAvgDeliveryTime(
				v.avgDeliveryTime != null ? String(v.avgDeliveryTime) : '',
			);
			setLogo(v.logo ?? '');
			setCoverImage(v.coverImage ?? '');
		} catch {
			Alert.alert('Error', 'Could not load your store profile.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadProfile();
	}, [loadProfile]);

	const pickImage = async (type: 'logo' | 'cover') => {
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert(
				'Permission needed',
				'Allow access to your photo library to update images.',
			);
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
			Alert.alert(
				'Upload failed',
				'Could not upload the image. Please try again.',
			);
		} finally {
			setUploadingLogo(false);
			setUploadingCover(false);
		}
	};

	const handleSave = async () => {
		if (!businessName.trim()) {
			Alert.alert('Required', 'Business name cannot be empty.');
			return;
		}
		if (!address.trim() || !city.trim()) {
			Alert.alert('Required', 'Address and city are required.');
			return;
		}
		try {
			setSaving(true);
			await api.patch('/vendors/me', {
				businessName: businessName.trim(),
				description: description.trim() || null,
				logo: logo || null,
				coverImage: coverImage || null,
				address: address.trim(),
				city: city.trim(),
				state: stateVal.trim() || 'Rivers',
				openingTime: openingTime.trim() || null,
				closingTime: closingTime.trim() || null,
				avgDeliveryTime: avgDeliveryTime.trim()
					? parseInt(avgDeliveryTime.trim(), 10)
					: null,
			});
			router.back();
		} catch {
			Alert.alert(
				'Save failed',
				'Could not save your changes. Please try again.',
			);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<View
				style={{
					flex: 1,
					backgroundColor: T.bg,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<ActivityIndicator color={T.primary} />
			</View>
		);
	}

	const busy = saving || uploadingLogo || uploadingCover;

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[styles.header, { borderBottomColor: T.border, paddingTop: 16 }]}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>
					Edit Store Profile
				</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				{/* Cover image picker */}
				<Text style={[styles.sectionLabel, { color: T.textSec }]}>
					COVER IMAGE
				</Text>
				<TouchableOpacity
					onPress={() => pickImage('cover')}
					activeOpacity={0.85}
					style={[
						styles.coverPicker,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					{coverImage ? (
						<Image
							source={{ uri: coverImage }}
							style={StyleSheet.absoluteFill}
							resizeMode="cover"
						/>
					) : (
						<Text style={[styles.pickerHint, { color: T.textMuted }]}>
							Tap to add cover photo
						</Text>
					)}
					{uploadingCover ? (
						<View
							style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
						>
							<ActivityIndicator color="#fff" />
						</View>
					) : (
						<View style={[styles.cameraChip, { backgroundColor: T.primary }]}>
							<Ionicons name="camera" size={14} color="#fff" />
							<Text style={styles.cameraChipText}>
								{coverImage ? 'Change' : 'Add'}
							</Text>
						</View>
					)}
				</TouchableOpacity>

				{/* Logo picker */}
				<Text
					style={[styles.sectionLabel, { color: T.textSec, marginTop: 20 }]}
				>
					STORE LOGO
				</Text>
				<TouchableOpacity
					onPress={() => pickImage('logo')}
					style={styles.logoPicker}
					activeOpacity={0.85}
				>
					{logo ? (
						<Image
							source={{ uri: logo }}
							style={[styles.logoImg, { borderColor: T.border }]}
						/>
					) : (
						<View
							style={[
								styles.logoPlaceholder,
								{ backgroundColor: T.primaryTint, borderColor: T.border },
							]}
						>
							<Text style={{ fontSize: 30 }}>🍽️</Text>
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

				{/* Form fields */}
				<View style={styles.fields}>
					<Field
						label="Business Name *"
						value={businessName}
						onChange={setBusinessName}
						placeholder="e.g. Mama Titi Kitchen"
						T={T}
					/>
					<Field
						label="Description"
						value={description}
						onChange={setDescription}
						placeholder="What makes your store special…"
						T={T}
						multiline
					/>
					<Field
						label="Street Address *"
						value={address}
						onChange={setAddress}
						placeholder="e.g. 12 Wetheral Road"
						T={T}
					/>
					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<Field
								label="City *"
								value={city}
								onChange={setCity}
								placeholder="Owerri"
								T={T}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Field
								label="State"
								value={stateVal}
								onChange={setStateVal}
								placeholder="Rivers"
								T={T}
							/>
						</View>
					</View>
					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<Field
								label="Opening Time"
								value={openingTime}
								onChange={setOpeningTime}
								placeholder="08:00"
								T={T}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Field
								label="Closing Time"
								value={closingTime}
								onChange={setClosingTime}
								placeholder="22:00"
								T={T}
							/>
						</View>
					</View>
					<Field
						label="Avg Delivery Time (mins)"
						value={avgDeliveryTime}
						onChange={setAvgDeliveryTime}
						placeholder="e.g. 30"
						keyboardType="numeric"
						T={T}
					/>
				</View>
			</ScrollView>

			{/* Footer save button */}
			<View
				style={[
					styles.footer,
					{ backgroundColor: T.bg, borderTopColor: T.border },
				]}
			>
				<TouchableOpacity
					onPress={handleSave}
					disabled={busy}
					style={[
						styles.saveBtn,
						{ backgroundColor: busy ? T.surface3 : T.primary },
					]}
					activeOpacity={0.85}
				>
					{saving ? (
						<ActivityIndicator color="#fff" size="small" />
					) : (
						<Text style={styles.saveBtnText}>Save Changes</Text>
					)}
				</TouchableOpacity>
			</View>
		</View>
	);
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	multiline,
	keyboardType,
	T,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	multiline?: boolean;
	keyboardType?: any;
	T: any;
}) {
	return (
		<View style={styles.fieldWrap}>
			<Text style={[styles.fieldLabel, { color: T.textSec }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={T.textMuted}
				multiline={multiline}
				numberOfLines={multiline ? 3 : 1}
				keyboardType={keyboardType ?? 'default'}
				style={[
					styles.input,
					{ backgroundColor: T.surface, borderColor: T.border, color: T.text },
					multiline && styles.inputMultiline,
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingBottom: 16,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 24, paddingBottom: 40 },
	sectionLabel: {
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 0.5,
		marginBottom: 8,
	},
	coverPicker: {
		height: 140,
		borderRadius: 4,
		borderWidth: 1,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	pickerHint: { fontSize: 13 },
	overlay: {
		position: 'absolute',
		inset: 0,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cameraChip: {
		position: 'absolute',
		bottom: 10,
		right: 10,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		borderRadius: 4,
		paddingVertical: 5,
		paddingHorizontal: 10,
	},
	cameraChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
	logoPicker: { alignSelf: 'flex-start', marginBottom: 4 },
	logoImg: { width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
	logoPlaceholder: {
		width: 80,
		height: 80,
		borderRadius: 40,
		borderWidth: 2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	logoCameraBtn: {
		position: 'absolute',
		bottom: 0,
		right: 0,
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: 'center',
		justifyContent: 'center',
	},
	fields: { marginTop: 20, gap: 16 },
	row: { flexDirection: 'row', gap: 12 },
	fieldWrap: { gap: 6 },
	fieldLabel: {
		fontSize: 12,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	input: {
		height: 48,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 14,
		fontWeight: '500',
	},
	inputMultiline: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
	footer: { padding: 20, paddingBottom: 36, borderTopWidth: 1 },
	saveBtn: {
		height: 52,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
