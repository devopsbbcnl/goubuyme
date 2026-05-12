import React, { useState, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Image,
	ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

interface VendorProfile {
	id: string;
	businessName: string;
	description: string | null;
	logo: string | null;
	coverImage: string | null;
	category: string;
	address: string;
	city: string;
	state: string;
	openingTime: string | null;
	closingTime: string | null;
	isOpen: boolean;
	rating: number;
	totalRatings: number;
	approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
	user: { name: string; email: string; phone: string | null };
}

type MenuRow = {
	icon: string;
	label: string;
	sub: string | null;
	route?: string;
};

const MENU_ROWS: MenuRow[] = [
	{
		icon: '🍽️',
		label: 'Menu Items',
		sub: 'Add and manage food items',
		route: '/(vendor)/menu',
	},
	{
		icon: '💳',
		label: 'Earnings',
		sub: 'Payouts and revenue',
		route: '/(vendor)/earnings',
	},
	{
		icon: '🎯',
		label: 'Promotions',
		sub: 'Manage your promo cards',
		route: '/(vendor)/promotions',
	},
	{
		icon: '🏢',
		label: 'Business Verification',
		sub: 'CAC, TIN & director ID',
		route: '/(vendor)/business-verification',
	},
	{
		icon: '📜',
		label: 'Licenses & Permits',
		sub: 'NAFDAC, pharmacy & more',
		route: '/(vendor)/licenses',
	},
	{ icon: '🔔', label: 'Notifications', sub: 'Manage alerts', route: '/(vendor)/notifications' },
	{ icon: '⚙️', label: 'Settings', sub: 'Theme, language & more', route: '/(vendor)/settings' },
	{ icon: '🚪', label: 'Sign Out', sub: null },
];

const STATUS_COLOR: Record<string, string> = {
	APPROVED: '#1A9E5F',
	PENDING: '#F5A623',
	REJECTED: '#E23B3B',
	SUSPENDED: '#E23B3B',
};

export default function VendorProfileScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { user, logout } = useAuth();
	const [profile, setProfile] = useState<VendorProfile | null>(null);
	const [loading, setLoading] = useState(true);

	const fetchProfile = useCallback(async () => {
		try {
			const res = await api.get('/vendors/me');
			setProfile(res.data.data);
		} catch {
			// show fallback with auth user info
		} finally {
			setLoading(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchProfile();
		}, [fetchProfile]),
	);

	const handleRow = (row: MenuRow) => {
		if (row.label === 'Sign Out') {
			logout();
			router.replace('/login');
			return;
		}
		if (row.route) router.push(row.route as any);
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

	const statusColor = STATUS_COLOR[profile?.approvalStatus ?? 'PENDING'];

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<View style={[styles.headerRow, { paddingTop: 16 }]}>
					<TouchableOpacity
						onPress={() => router.back()}
						style={styles.backBtn}
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					>
						<Ionicons name="arrow-back" size={22} color={T.text} />
					</TouchableOpacity>
					<Text style={[styles.pageTitle, { color: T.text }]}>
						Store Profile
					</Text>
					<View style={{ width: 38 }} />
				</View>

				{/* Cover image */}
				<View
					style={[
						styles.cover,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					{profile?.coverImage ? (
						<Image
							source={{ uri: profile.coverImage }}
							style={StyleSheet.absoluteFill}
							resizeMode="cover"
						/>
					) : (
						<Text style={[styles.coverPlaceholderText, { color: T.textMuted }]}>
							No cover image
						</Text>
					)}
				</View>

				{/* Logo + name row */}
				<View style={[styles.logoRow, { paddingHorizontal: 20 }]}>
					<View>
						{profile?.logo ? (
							<Image
								source={{ uri: profile.logo }}
								style={[styles.logo, { borderColor: T.bg }]}
							/>
						) : (
							<View
								style={[
									styles.logoPlaceholder,
									{ backgroundColor: T.primary, borderColor: T.bg },
								]}
							>
								<Text style={{ fontSize: 26 }}>🍽️</Text>
							</View>
						)}
						<TouchableOpacity
							onPress={() => router.push('/(vendor)/edit-profile' as any)}
							style={[styles.cameraBtn, { backgroundColor: T.primary }]}
						>
							<Ionicons name="camera" size={11} color="#fff" />
						</TouchableOpacity>
					</View>

					<View style={{ flex: 1 }}>
						<Text style={[styles.bizName, { color: T.text }]}>
							{profile?.businessName ?? user?.name ?? 'My Store'}
						</Text>
						<Text style={[styles.category, { color: T.textSec }]}>
							{profile?.category ?? ''}
						</Text>
						<View
							style={[
								styles.statusPill,
								{ backgroundColor: `${statusColor}18` },
							]}
						>
							<Text style={[styles.statusPillText, { color: statusColor }]}>
								{profile?.approvalStatus ?? 'PENDING'}
							</Text>
						</View>
					</View>

					<TouchableOpacity
						onPress={() => router.push('/(vendor)/edit-profile' as any)}
						style={[styles.editBtn, { backgroundColor: T.primaryTint }]}
						activeOpacity={0.75}
					>
						<Text style={[styles.editBtnText, { color: T.primary }]}>Edit</Text>
					</TouchableOpacity>
				</View>

				{/* Info card */}
				<View
					style={[
						styles.infoCard,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					{[
						{ icon: '📧', value: profile?.user?.email ?? user?.email ?? '' },
						{
							icon: '📱',
							value: profile?.user?.phone ?? user?.phone ?? 'No phone added',
						},
						{
							icon: '📍',
							value:
								[profile?.address, profile?.city, profile?.state]
									.filter(Boolean)
									.join(', ') || 'Address not set',
						},
						{
							icon: '🕐',
							value:
								profile?.openingTime && profile?.closingTime
									? `${profile.openingTime} – ${profile.closingTime}`
									: 'Hours not set',
						},
						{
							icon: '⭐',
							value: `${(profile?.rating ?? 0).toFixed(1)} (${profile?.totalRatings ?? 0} ratings)`,
						},
					].map((row, i) => (
						<View
							key={i}
							style={[
								styles.infoRow,
								{
									borderBottomColor: T.border,
									borderBottomWidth: i < 4 ? 1 : 0,
								},
							]}
						>
							<Text style={styles.infoIcon}>{row.icon}</Text>
							<Text style={[styles.infoValue, { color: T.text }]}>
								{row.value}
							</Text>
						</View>
					))}
				</View>

				{/* Menu rows */}
				<View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
					{MENU_ROWS.map((row, i) => (
						<TouchableOpacity
							key={row.label}
							onPress={() => handleRow(row)}
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
								<Ionicons
									name="chevron-forward"
									size={14}
									color={T.textMuted}
								/>
							)}
						</TouchableOpacity>
					))}
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pageTitle: { fontSize: 18, fontWeight: '800' },
	cover: {
		height: 120,
		marginHorizontal: 20,
		borderRadius: 4,
		borderWidth: 1,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: -28,
	},
	coverPlaceholderText: { fontSize: 12 },
	logoRow: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		gap: 12,
		paddingTop: 0,
		marginBottom: 16,
	},
	logo: { width: 64, height: 64, borderRadius: 32, borderWidth: 3 },
	logoPlaceholder: {
		width: 64,
		height: 64,
		borderRadius: 32,
		borderWidth: 3,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cameraBtn: {
		position: 'absolute',
		bottom: 0,
		right: 0,
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
	},
	bizName: { fontSize: 16, fontWeight: '800' },
	category: { fontSize: 12, marginTop: 1 },
	statusPill: {
		alignSelf: 'flex-start',
		borderRadius: 4,
		paddingVertical: 2,
		paddingHorizontal: 7,
		marginTop: 4,
	},
	statusPillText: { fontSize: 10, fontWeight: '700' },
	editBtn: {
		borderRadius: 4,
		paddingVertical: 6,
		paddingHorizontal: 12,
		alignSelf: 'flex-end',
	},
	editBtnText: { fontSize: 12, fontWeight: '700' },
	infoCard: {
		marginHorizontal: 20,
		borderRadius: 4,
		borderWidth: 1,
		marginBottom: 8,
	},
	infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
	infoIcon: { fontSize: 16, width: 24, textAlign: 'center' },
	infoValue: { fontSize: 13, flex: 1 },
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
