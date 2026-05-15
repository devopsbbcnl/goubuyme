import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Image,
	ActivityIndicator,
	TextInput,
	Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

async function uploadToCloudinary(uri: string): Promise<string> {
	if (!CLOUD_NAME || CLOUD_NAME === 'your_cloud_name') return uri;
	const form = new FormData();
	form.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
	form.append('upload_preset', UPLOAD_PRESET);
	const res = await fetch(
		`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
		{ method: 'POST', body: form },
	);
	if (!res.ok) throw new Error('Upload failed');
	return ((await res.json()) as { secure_url: string }).secure_url;
}

interface RiderProfile {
	id: string;
	vehicleType: string;
	plateNumber: string | null;
	isOnline: boolean;
	isAvailable: boolean;
	approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
	rating: number;
	totalRatings: number;
	user: {
		name: string;
		email: string;
		phone: string | null;
		avatar: string | null;
	};
}

const STATUS_COLOR: Record<string, string> = {
	APPROVED: '#1A9E5F',
	PENDING: '#F5A623',
	REJECTED: '#E23B3B',
	SUSPENDED: '#E23B3B',
};

const MENU_ROWS = [
	{ icon: '💳', label: 'Earnings', sub: 'Payouts and history' },
	{ icon: '🪪', label: 'Identity Documents', sub: 'NIN, selfie & guarantor' },
	{ icon: '🔔', label: 'Notifications', sub: 'Manage alerts' },
	{ icon: '⚙️', label: 'Settings', sub: 'Theme, language & more' },
	{ icon: '🚪', label: 'Sign Out', sub: null },
];

export default function RiderProfileScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { user, logout, updateUser } = useAuth();
	const [profile, setProfile] = useState<RiderProfile | null>(null);
	const [loading, setLoading] = useState(true);

	const [uploadingAvatar, setUploadingAvatar] = useState(false);

	// Edit state
	const [isEditing, setIsEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [draftName, setDraftName] = useState('');
	const [draftPhone, setDraftPhone] = useState('');
	const [draftVehicle, setDraftVehicle] = useState('');
	const [draftPlate, setDraftPlate] = useState('');

	const fetchProfile = useCallback(async () => {
		try {
			const res = await api.get('/riders/me');
			setProfile(res.data.data);
		} catch {
			// fall back to auth user data
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProfile();
	}, [fetchProfile]);

	const pickAvatar = async () => {
		const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!perm.granted) {
			Alert.alert('Permission needed', 'Allow access to your photo library to change your profile picture.');
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
		try {
			setUploadingAvatar(true);
			const url = await uploadToCloudinary(uri);
			await api.patch('/auth/profile', { photoUrl: url });
			await updateUser({ photoUrl: url });
			setProfile((prev) =>
				prev ? { ...prev, user: { ...prev.user, avatar: url } } : prev,
			);
		} catch {
			Alert.alert('Upload failed', 'Could not upload your photo. Please try again.');
		} finally {
			setUploadingAvatar(false);
		}
	};

	const startEdit = () => {
		setDraftName(profile?.user?.name ?? user?.name ?? '');
		setDraftPhone(profile?.user?.phone ?? user?.phone ?? '');
		setDraftVehicle(profile?.vehicleType ?? '');
		setDraftPlate(profile?.plateNumber ?? '');
		setIsEditing(true);
	};

	const cancelEdit = () => {
		setIsEditing(false);
	};

	const handleSave = async () => {
		if (!draftName.trim()) {
			Alert.alert('Name required', 'Please enter your full name.');
			return;
		}
		try {
			setSaving(true);
			await Promise.all([
				api.patch('/auth/profile', {
					name: draftName.trim(),
					...(draftPhone.trim() ? { phone: draftPhone.trim() } : {}),
				}),
				api.patch('/riders/me', {
					...(draftVehicle.trim() ? { vehicleType: draftVehicle.trim() } : {}),
					...(draftPlate.trim() ? { plateNumber: draftPlate.trim().toUpperCase() } : {}),
				}),
			]);
			setProfile((prev) =>
				prev
					? {
							...prev,
							vehicleType: draftVehicle.trim() || prev.vehicleType,
							plateNumber: draftPlate.trim().toUpperCase() || prev.plateNumber,
							user: {
								...prev.user,
								name: draftName.trim(),
								phone: draftPhone.trim() || prev.user.phone,
							},
					  }
					: prev,
			);
			setIsEditing(false);
		} catch {
			Alert.alert('Save failed', 'Could not save your changes. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const handleRow = (label: string) => {
		if (label === 'Sign Out') {
			logout();
			router.replace('/onboarding');
		} else if (label === 'Earnings') {
			router.push('/(rider)/earnings');
		} else if (label === 'Identity Documents') {
			router.push('/(rider)/document');
		} else if (label === 'Notifications') {
			router.push('/(rider)/notifications');
		} else if (label === 'Settings') {
			router.push('/(rider)/settings');
		}
	};

	if (loading) {
		return (
			<View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator color={T.primary} />
			</View>
		);
	}

	const statusColor = STATUS_COLOR[profile?.approvalStatus ?? 'PENDING'];

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				{/* Header */}
				<View style={[styles.headerRow, { paddingTop: insets.top + 16 }]}>
					{isEditing ? (
						<TouchableOpacity onPress={cancelEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
							<Text style={{ color: T.primary, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
						</TouchableOpacity>
					) : (
						<Text style={[styles.pageTitle, { color: T.text }]}>My Profile</Text>
					)}

					{isEditing && (
						<Text style={[styles.pageTitle, { color: T.text, fontSize: 18 }]}>Edit Profile</Text>
					)}

					{isEditing ? (
						<TouchableOpacity
							onPress={handleSave}
							disabled={saving}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							{saving ? (
								<ActivityIndicator size="small" color={T.primary} />
							) : (
								<Text style={{ color: T.primary, fontSize: 14, fontWeight: '700' }}>Save</Text>
							)}
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							onPress={startEdit}
							style={styles.editBtn}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							<Ionicons name="create-outline" size={20} color={T.primary} />
						</TouchableOpacity>
					)}
				</View>

				{/* Avatar + name */}
				<View style={[styles.heroCard, { backgroundColor: T.surface, borderColor: T.border }]}>
					<TouchableOpacity
						onPress={pickAvatar}
						activeOpacity={0.8}
						disabled={uploadingAvatar}
						style={styles.avatarWrap}
					>
						{profile?.user?.avatar ? (
							<Image source={{ uri: profile.user.avatar }} style={styles.avatarImg} />
						) : (
							<View style={[styles.avatarPlaceholder, { backgroundColor: '#1A6EFF' }]}>
								<Text style={{ fontSize: 28 }}>🏍️</Text>
							</View>
						)}
						{uploadingAvatar ? (
							<View style={[styles.avatarCameraOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
								<ActivityIndicator color="#fff" size="small" />
							</View>
						) : (
							<View style={[styles.avatarCameraBadge, { backgroundColor: T.primary }]}>
								<Ionicons name="camera" size={11} color="#fff" />
							</View>
						)}
					</TouchableOpacity>

					{isEditing ? (
						<TextInput
							value={draftName}
							onChangeText={setDraftName}
							placeholder="Full name"
							placeholderTextColor={T.textMuted}
							style={[styles.nameInput, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
						/>
					) : (
						<Text style={[styles.riderName, { color: T.text }]}>
							{profile?.user?.name ?? user?.name ?? 'Rider'}
						</Text>
					)}

					<View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
						<Text style={[styles.statusPillText, { color: statusColor }]}>
							{profile?.approvalStatus ?? 'PENDING'}
						</Text>
					</View>

					{!isEditing && (
						<View style={styles.statsRow}>
							<View style={styles.statItem}>
								<Text style={[styles.statVal, { color: T.primary }]}>
									{(profile?.rating ?? 0).toFixed(1)}
								</Text>
								<Text style={[styles.statLbl, { color: T.textSec }]}>Rating</Text>
							</View>
							<View style={[styles.statDivider, { backgroundColor: T.border }]} />
							<View style={styles.statItem}>
								<Text style={[styles.statVal, { color: T.primary }]}>
									{profile?.totalRatings ?? 0}
								</Text>
								<Text style={[styles.statLbl, { color: T.textSec }]}>Deliveries</Text>
							</View>
							<View style={[styles.statDivider, { backgroundColor: T.border }]} />
							<View style={styles.statItem}>
								<View
									style={[
										styles.onlineDot,
										{ backgroundColor: profile?.isOnline ? '#1A9E5F' : T.textMuted },
									]}
								/>
								<Text style={[styles.statLbl, { color: T.textSec }]}>
									{profile?.isOnline ? 'Online' : 'Offline'}
								</Text>
							</View>
						</View>
					)}
				</View>

				{/* Info card */}
				<View style={[styles.infoCard, { backgroundColor: T.surface, borderColor: T.border }]}>
					{/* Email — always read-only */}
					<View style={[styles.infoRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}>
						<Text style={styles.infoIcon}>📧</Text>
						<View style={{ flex: 1 }}>
							<Text style={[styles.infoValue, { color: T.text }]}>
								{profile?.user?.email ?? user?.email ?? ''}
							</Text>
							{isEditing && (
								<Text style={[styles.infoHint, { color: T.textMuted }]}>
									Contact support to change email
								</Text>
							)}
						</View>
					</View>

					{/* Phone */}
					<View style={[styles.infoRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}>
						<Text style={styles.infoIcon}>📱</Text>
						{isEditing ? (
							<TextInput
								value={draftPhone}
								onChangeText={setDraftPhone}
								placeholder="+234 800 000 0000"
								placeholderTextColor={T.textMuted}
								keyboardType="phone-pad"
								style={[styles.inlineInput, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
							/>
						) : (
							<Text style={[styles.infoValue, { color: T.text }]}>
								{profile?.user?.phone ?? user?.phone ?? 'No phone added'}
							</Text>
						)}
					</View>

					{/* Vehicle type */}
					<View style={[styles.infoRow, { borderBottomColor: T.border, borderBottomWidth: 1 }]}>
						<Text style={styles.infoIcon}>🏍️</Text>
						{isEditing ? (
							<TextInput
								value={draftVehicle}
								onChangeText={setDraftVehicle}
								placeholder="e.g. Honda CB150, Tricycle"
								placeholderTextColor={T.textMuted}
								style={[styles.inlineInput, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
							/>
						) : (
							<Text style={[styles.infoValue, { color: T.text }]}>
								{profile?.vehicleType ?? 'Vehicle not set'}
							</Text>
						)}
					</View>

					{/* Plate number */}
					<View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
						<Text style={styles.infoIcon}>🔑</Text>
						{isEditing ? (
							<TextInput
								value={draftPlate}
								onChangeText={(v) => setDraftPlate(v.toUpperCase())}
								placeholder="e.g. ABC 123 DE"
								placeholderTextColor={T.textMuted}
								autoCapitalize="characters"
								style={[styles.inlineInput, { color: T.text, borderColor: T.border, backgroundColor: T.surface2 }]}
							/>
						) : (
							<Text style={[styles.infoValue, { color: T.text }]}>
								{profile?.plateNumber ?? 'Plate number not set'}
							</Text>
						)}
					</View>
				</View>

				{/* Menu rows — hidden while editing */}
				{!isEditing && (
					<View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
						{MENU_ROWS.map((row, i) => (
							<TouchableOpacity
								key={row.label}
								onPress={() => handleRow(row.label)}
								style={[
									styles.menuRow,
									{
										borderBottomColor: T.border,
										borderBottomWidth: i < MENU_ROWS.length - 1 ? 1 : 0,
									},
								]}
								activeOpacity={0.7}
							>
								<Text style={styles.menuIcon}>{row.icon}</Text>
								<View style={{ flex: 1 }}>
									<Text
										style={[
											styles.menuLabel,
											{ color: row.label === 'Sign Out' ? T.error : T.text },
										]}
									>
										{row.label}
									</Text>
									{row.sub && (
										<Text style={[styles.menuSub, { color: T.textSec }]}>
											{row.sub}
										</Text>
									)}
								</View>
								{row.label !== 'Sign Out' && (
									<Ionicons name="chevron-forward" size={14} color={T.textMuted} />
								)}
							</TouchableOpacity>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	headerRow: {
		paddingHorizontal: 20,
		paddingBottom: 16,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	pageTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
	editBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
	heroCard: {
		marginHorizontal: 20,
		borderRadius: 4,
		borderWidth: 1,
		padding: 20,
		alignItems: 'center',
		marginBottom: 12,
	},
	avatarWrap: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
	avatarImg: { width: 72, height: 72, borderRadius: 36 },
	avatarPlaceholder: {
		width: 72,
		height: 72,
		borderRadius: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarCameraOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		borderRadius: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarCameraBadge: {
		position: 'absolute',
		bottom: 0,
		right: 0,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
	},
	riderName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
	nameInput: {
		fontSize: 16,
		fontWeight: '700',
		borderWidth: 1,
		borderRadius: 4,
		paddingHorizontal: 12,
		paddingVertical: 8,
		width: '80%',
		textAlign: 'center',
	},
	statusPill: {
		borderRadius: 4,
		paddingVertical: 3,
		paddingHorizontal: 10,
		marginTop: 6,
	},
	statusPillText: { fontSize: 11, fontWeight: '700' },
	statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 20 },
	statItem: { alignItems: 'center', gap: 4 },
	statVal: { fontSize: 18, fontWeight: '800' },
	statLbl: { fontSize: 11 },
	statDivider: { width: 1, height: 28 },
	onlineDot: { width: 10, height: 10, borderRadius: 5 },
	infoCard: {
		marginHorizontal: 20,
		borderRadius: 4,
		borderWidth: 1,
		marginBottom: 8,
	},
	infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
	infoIcon: { fontSize: 16, width: 24, textAlign: 'center' },
	infoValue: { fontSize: 13, flex: 1 },
	infoHint: { fontSize: 11, marginTop: 2 },
	inlineInput: {
		flex: 1,
		height: 38,
		borderWidth: 1,
		borderRadius: 4,
		paddingHorizontal: 10,
		fontSize: 13,
		fontWeight: '500',
	},
	menuRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		paddingVertical: 14,
	},
	menuIcon: { fontSize: 20, width: 24, textAlign: 'center' },
	menuLabel: { fontSize: 14, fontWeight: '600' },
	menuSub: { fontSize: 11, marginTop: 1 },
});
