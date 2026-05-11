import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Switch,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NotifSetting {
	id: string;
	section: string;
	label: string;
	sub: string;
	enabled: boolean;
}

const INITIAL_SETTINGS: NotifSetting[] = [
	// Orders
	{
		id: 'order_placed',
		section: 'Orders',
		label: 'Order Confirmed',
		sub: 'When your order is accepted by vendor',
		enabled: true,
	},
	{
		id: 'order_ready',
		section: 'Orders',
		label: 'Order Ready',
		sub: 'When vendor marks your order as ready',
		enabled: true,
	},
	{
		id: 'order_pickup',
		section: 'Orders',
		label: 'Rider Picked Up',
		sub: 'When rider picks up your order',
		enabled: true,
	},
	{
		id: 'order_delivered',
		section: 'Orders',
		label: 'Order Delivered',
		sub: 'Delivery confirmation',
		enabled: true,
	},
	{
		id: 'order_cancelled',
		section: 'Orders',
		label: 'Order Cancelled',
		sub: 'If your order is cancelled',
		enabled: true,
	},
	// Promos
	{
		id: 'promo_deals',
		section: 'Promotions',
		label: 'Deals & Discounts',
		sub: 'Flash sales and limited offers',
		enabled: true,
	},
	{
		id: 'promo_new',
		section: 'Promotions',
		label: 'New on GoBuyMe',
		sub: 'New vendors and features',
		enabled: false,
	},
	{
		id: 'promo_loyalty',
		section: 'Promotions',
		label: 'Loyalty Rewards',
		sub: 'Points updates and reward milestones',
		enabled: true,
	},
	// Account
	{
		id: 'acct_security',
		section: 'Account',
		label: 'Security Alerts',
		sub: 'Login from new device, password changes',
		enabled: true,
	},
	{
		id: 'acct_updates',
		section: 'Account',
		label: 'Account Updates',
		sub: 'Changes to your profile',
		enabled: false,
	},
];

export default function NotificationsScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [settings, setSettings] = useState<NotifSetting[]>(INITIAL_SETTINGS);

	const toggle = (id: string) => {
		setSettings((prev) =>
			prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
		);
	};

	const sections = [...new Set(settings.map((s) => s.section))];

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
				<Text style={[styles.title, { color: T.text }]}>Notifications</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{/* Push notifications master toggle info */}
				<View style={[styles.infoBanner, { backgroundColor: T.primaryTint }]}>
					<Ionicons name="notifications" size={18} color={T.primary} />
					<Text style={[styles.infoText, { color: T.primary }]}>
						Push notifications are enabled for this device
					</Text>
				</View>

				{sections.map((section) => (
					<View key={section} style={{ marginBottom: 4 }}>
						<Text style={[styles.sectionTitle, { color: T.textMuted }]}>
							{section.toUpperCase()}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							{settings
								.filter((s) => s.section === section)
								.map((s, i, arr) => (
									<View
										key={s.id}
										style={[
											styles.row,
											{
												borderBottomColor: T.border,
												borderBottomWidth: i < arr.length - 1 ? 1 : 0,
											},
										]}
									>
										<View style={{ flex: 1, paddingRight: 12 }}>
											<Text style={[styles.rowLabel, { color: T.text }]}>
												{s.label}
											</Text>
											<Text style={[styles.rowSub, { color: T.textSec }]}>
												{s.sub}
											</Text>
										</View>
										<Switch
											value={s.enabled}
											onValueChange={() => toggle(s.id)}
											trackColor={{ false: T.surface3, true: T.primary }}
											thumbColor="#fff"
										/>
									</View>
								))}
						</View>
					</View>
				))}
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
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	infoBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		padding: 12,
		borderRadius: 4,
	},
	infoText: { fontSize: 13, fontWeight: '600', flex: 1 },
	sectionTitle: {
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 0.8,
		marginBottom: 8,
	},
	sectionCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	rowLabel: { fontSize: 14, fontWeight: '600' },
	rowSub: { fontSize: 12, marginTop: 2 },
});
