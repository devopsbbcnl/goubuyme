import React, { useEffect, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Switch,
	Alert,
	Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavApp = 'google_maps' | 'waze' | 'in_app';

const NAV_APP_LABELS: Record<NavApp, string> = {
	google_maps: 'Google Maps',
	waze: 'Waze',
	in_app: 'In-app map',
};

const comingSoon = (label: string) =>
	Alert.alert('Coming Soon', `${label} options will be available in a future update.`);

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function RiderSettingsScreen() {
	const { theme: T, isDark, toggleTheme } = useTheme();
	const insets = useSafeAreaInsets();

	const [navApp, setNavApp] = useState<NavApp>('in_app');

	useEffect(() => {
		AsyncStorage.getItem('rider_nav_app').then(val => {
			if (val === 'google_maps' || val === 'waze' || val === 'in_app') setNavApp(val);
		});
	}, []);

	const handleNavAppSelect = () => {
		Alert.alert(
			'Navigation App',
			'Choose your preferred navigation app for deliveries',
			[
				{
					text: 'Google Maps',
					onPress: () => {
						setNavApp('google_maps');
						AsyncStorage.setItem('rider_nav_app', 'google_maps');
					},
				},
				{
					text: 'Waze',
					onPress: () => {
						setNavApp('waze');
						AsyncStorage.setItem('rider_nav_app', 'waze');
					},
				},
				{
					text: 'In-app Map',
					onPress: () => {
						setNavApp('in_app');
						AsyncStorage.setItem('rider_nav_app', 'in_app');
					},
				},
				{ text: 'Cancel', style: 'cancel' },
			],
		);
	};

	const SECTIONS = [
		{
			title: 'Appearance',
			items: [
				{
					icon: isDark ? 'moon' : 'sunny',
					label: 'Dark Mode',
					sub: isDark ? 'Switch to light theme' : 'Switch to dark theme',
					control: (
						<Switch
							value={isDark}
							onValueChange={toggleTheme}
							trackColor={{ false: T.surface3, true: T.primary }}
							thumbColor="#fff"
						/>
					),
					onPress: undefined as (() => void) | undefined,
				},
			],
		},
		{
			title: 'Delivery Preferences',
			items: [
				{
					icon: 'bicycle-outline',
					label: 'Vehicle Type',
					sub: 'Change in profile',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => router.navigate('/(rider)/profile'),
				},
				{
					icon: 'map-outline',
					label: 'Service Area',
					sub: 'Port Harcourt',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => comingSoon('Service Area'),
				},
				{
					icon: 'navigate-outline',
					label: 'Navigation App',
					sub: NAV_APP_LABELS[navApp],
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: handleNavAppSelect,
				},
			],
		},
		{
			title: 'Preferences',
			items: [
				{
					icon: 'language-outline',
					label: 'Language',
					sub: 'English (Nigeria)',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => comingSoon('Language'),
				},
				{
					icon: 'cash-outline',
					label: 'Currency',
					sub: 'Nigerian Naira (₦)',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => comingSoon('Currency'),
				},
			],
		},
		{
			title: 'Security',
			items: [
				{
					icon: 'lock-closed-outline',
					label: 'Change Password',
					sub: 'Update your account password',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => router.push('/change-password' as any),
				},
				{
					icon: 'shield-checkmark-outline',
					label: 'Two-Factor Auth',
					sub: 'Authenticator app (TOTP)',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => router.push('/mfa-setup' as any),
				},
			],
		},
		{
			title: 'About',
			items: [
				{
					icon: 'information-circle-outline',
					label: 'App Version',
					sub: `v${APP_VERSION}`,
					control: null,
					onPress: undefined,
				},
				{
					icon: 'star-outline',
					label: "What's New",
					sub: 'See latest updates',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => router.push('/whats-new' as any),
				},
				{
					icon: 'chatbubble-ellipses-outline',
					label: 'Contact Support',
					sub: 'Chat with our support team',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => router.push('/contact-support' as any),
				},
				{
					icon: 'globe-outline',
					label: 'Website',
					sub: 'gobuyme.shop',
					control: <Ionicons name="chevron-forward" size={14} color={T.textMuted} />,
					onPress: () => Linking.openURL('https://gobuyme.shop'),
				},
			],
		},
	];

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
				<TouchableOpacity
					onPress={() => router.navigate('/(rider)/profile')}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Settings</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{SECTIONS.map((section) => (
					<View key={section.title} style={{ gap: 8 }}>
						<Text style={[styles.sectionLabel, { color: T.textMuted }]}>
							{section.title.toUpperCase()}
						</Text>
						<View style={[styles.sectionCard, { backgroundColor: T.surface, borderColor: T.border }]}>
							{section.items.map((item, i) => (
								<TouchableOpacity
									key={item.label}
									onPress={item.onPress}
									activeOpacity={item.onPress ? 0.7 : 1}
									style={[
										styles.row,
										{ borderBottomColor: T.border, borderBottomWidth: i < section.items.length - 1 ? 1 : 0 },
									]}
								>
									<View style={[styles.rowIcon, { backgroundColor: T.primaryTint }]}>
										<Ionicons name={item.icon as any} size={18} color={T.primary} />
									</View>
									<View style={{ flex: 1 }}>
										<Text style={[styles.rowLabel, { color: T.text }]}>{item.label}</Text>
										{item.sub && (
											<Text style={[styles.rowSub, { color: T.textSec }]}>{item.sub}</Text>
										)}
									</View>
									{item.control}
								</TouchableOpacity>
							))}
						</View>
					</View>
				))}

				<Text style={[styles.buildInfo, { color: T.textMuted }]}>
					GoBuyMe © 2026 · Bubble Barrel
				</Text>
			</ScrollView>
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
	backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 20, paddingBottom: 40 },
	sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
	sectionCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	rowIcon: { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
	rowLabel: { fontSize: 14, fontWeight: '600' },
	rowSub: { fontSize: 12, marginTop: 1 },
	buildInfo: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
