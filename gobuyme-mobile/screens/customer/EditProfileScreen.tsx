import React, { useState } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

async function uploadToCloudinary(uri: string): Promise<string> {
	const form = new FormData();
	form.append('file', { uri, type: 'image/jpeg', name: 'profile.jpg' } as any);
	form.append('upload_preset', UPLOAD_PRESET);
	const res = await fetch(
		`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
		{
			method: 'POST',
			body: form,
		},
	);
	if (!res.ok) throw new Error('Upload failed');
	const json = await res.json();
	return json.secure_url as string;
}

export default function EditProfileScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { user, updateUser } = useAuth();

	const [name, setName] = useState(user?.name ?? '');
	const [phone, setPhone] = useState(user?.phone ?? '');
	const [photoUrl, setPhotoUrl] = useState(user?.photoUrl ?? '');
	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);

	const pickImage = async () => {
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert(
				'Permission needed',
				'Allow access to your photo library to change your profile picture.',
			);
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
		if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') {
			// fallback: use local URI if Cloudinary not configured
			setPhotoUrl(uri);
			return;
		}
		try {
			setUploading(true);
			const url = await uploadToCloudinary(uri);
			setPhotoUrl(url);
		} catch {
			Alert.alert(
				'Upload failed',
				'Could not upload your photo. Please try again.',
			);
		} finally {
			setUploading(false);
		}
	};

	const handleSave = async () => {
		if (!name.trim()) {
			Alert.alert('Name required', 'Please enter your full name.');
			return;
		}
		try {
			setSaving(true);
			await api.patch('/auth/profile', {
				name: name.trim(),
				phone: phone.trim() || undefined,
				photoUrl: photoUrl || undefined,
			});
			await updateUser({ name: name.trim(), phone: phone.trim(), photoUrl });
			router.back();
		} finally {
			setSaving(false);
		}
	};

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
				<Text style={[styles.title, { color: T.text }]}>Edit Profile</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{/* Avatar picker */}
				<View style={styles.avatarSection}>
					<TouchableOpacity
						onPress={pickImage}
						activeOpacity={0.8}
						style={[
							styles.avatarWrap,
							{ backgroundColor: T.surface3, borderColor: T.border },
						]}
					>
						{photoUrl ? (
							<Image source={{ uri: photoUrl }} style={styles.avatarImg} />
						) : (
							<View
								style={[
									styles.avatarPlaceholder,
									{ backgroundColor: T.primaryTint },
								]}
							>
								<Text style={{ fontSize: 36 }}>👤</Text>
							</View>
						)}
						{uploading ? (
							<View
								style={[
									styles.avatarOverlay,
									{ backgroundColor: 'rgba(0,0,0,0.5)' },
								]}
							>
								<ActivityIndicator color="#fff" />
							</View>
						) : (
							<View
								style={[
									styles.avatarOverlay,
									{ backgroundColor: 'rgba(0,0,0,0.35)' },
								]}
							>
								<Ionicons name="camera" size={22} color="#fff" />
							</View>
						)}
					</TouchableOpacity>
					<Text style={[styles.avatarHint, { color: T.textSec }]}>
						Tap to change photo
					</Text>
				</View>

				{/* Fields */}
				<View style={styles.fields}>
					<Field
						label="Full Name"
						value={name}
						onChange={setName}
						placeholder="Your full name"
						T={T}
					/>
					<Field
						label="Phone Number"
						value={phone}
						onChange={setPhone}
						placeholder="+234 800 000 0000"
						keyboardType="phone-pad"
						T={T}
					/>
					<View
						style={[
							styles.emailRow,
							{ backgroundColor: T.surface2, borderColor: T.border },
						]}
					>
						<Text style={[styles.fieldLabel, { color: T.textSec }]}>Email</Text>
						<Text style={[styles.emailValue, { color: T.textMuted }]}>
							{user?.email ?? ''}
						</Text>
						<Text style={[styles.emailNote, { color: T.textMuted }]}>
							Contact support to change email
						</Text>
					</View>
				</View>
			</ScrollView>

			{/* Save button */}
			<View
				style={[
					styles.footer,
					{ backgroundColor: T.bg, borderTopColor: T.border },
				]}
			>
				<TouchableOpacity
					onPress={handleSave}
					disabled={saving || uploading}
					style={[
						styles.saveBtn,
						{ backgroundColor: saving || uploading ? T.surface3 : T.primary },
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
	keyboardType,
	T,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
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
				keyboardType={keyboardType}
				style={[
					styles.input,
					{ backgroundColor: T.surface, borderColor: T.border, color: T.text },
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
	avatarSection: { alignItems: 'center', marginBottom: 32 },
	avatarWrap: {
		width: 100,
		height: 100,
		borderRadius: 50,
		overflow: 'hidden',
		borderWidth: 2,
		position: 'relative',
	},
	avatarImg: { width: '100%', height: '100%' },
	avatarPlaceholder: {
		width: '100%',
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarOverlay: {
		position: 'absolute',
		inset: 0,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarHint: { marginTop: 10, fontSize: 12 },
	fields: { gap: 16 },
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
	emailRow: { borderRadius: 4, borderWidth: 1, padding: 14, gap: 4 },
	emailValue: { fontSize: 14, fontWeight: '500' },
	emailNote: { fontSize: 11, marginTop: 2 },
	footer: { padding: 20, paddingBottom: 36, borderTopWidth: 1 },
	saveBtn: {
		height: 52,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
