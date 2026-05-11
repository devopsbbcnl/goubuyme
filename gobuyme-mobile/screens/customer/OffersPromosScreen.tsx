import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Alert,
	Clipboard,
	ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

interface Promo {
	id: string;
	code: string;
	title: string;
	description: string;
	discount: string;
	expiry: string;
	used: boolean;
	type: 'percent' | 'flat' | 'free_delivery';
}

const TYPE_COLOR: Record<Promo['type'], string> = {
	percent: '#1A6EFF',
	flat: '#1A9E5F',
	free_delivery: '#FF521B',
};

export default function OffersPromosScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [promoInput, setPromoInput] = useState('');
	const [activeTab, setActiveTab] = useState<'active' | 'used'>('active');
	const [promos, setPromos] = useState<Promo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		api.get('/offers')
			.then(res => setPromos(res.data.data ?? []))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	const copyCode = (code: string) => {
		Clipboard.setString(code);
		Alert.alert('Copied!', `Promo code "${code}" copied to clipboard.`);
	};

	const applyPromo = () => {
		const found = promos.find(
			(p) => p.code === promoInput.trim().toUpperCase(),
		);
		if (!found) {
			Alert.alert(
				'Invalid Code',
				'This promo code is not valid or has expired.',
			);
			return;
		}
		if (found.used) {
			Alert.alert('Already Used', 'This promo code has already been redeemed.');
			return;
		}
		Alert.alert(
			'Promo Applied!',
			`"${found.title}" will be applied on your next order.`,
		);
		setPromoInput('');
	};

	const filtered = promos.filter((p) =>
		activeTab === 'active' ? !p.used : p.used,
	);

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
				<Text style={[styles.title, { color: T.text }]}>Offers & Promos</Text>
				<View style={{ width: 38 }} />
			</View>

			{loading ? (
				<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
					<ActivityIndicator size="large" color={T.primary} />
				</View>
			) : <ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{/* Enter promo code */}
				<View
					style={[
						styles.inputCard,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<Text style={[styles.inputCardTitle, { color: T.text }]}>
						Have a promo code?
					</Text>
					<View style={styles.inputRow}>
						<TextInput
							value={promoInput}
							onChangeText={setPromoInput}
							placeholder="Enter code here"
							placeholderTextColor={T.textMuted}
							autoCapitalize="characters"
							style={[
								styles.codeInput,
								{
									backgroundColor: T.surface2,
									borderColor: T.border,
									color: T.text,
								},
							]}
						/>
						<TouchableOpacity
							onPress={applyPromo}
							style={[styles.applyBtn, { backgroundColor: T.primary }]}
							activeOpacity={0.85}
						>
							<Text style={styles.applyBtnText}>Apply</Text>
						</TouchableOpacity>
					</View>
				</View>

				{/* Tabs */}
				<View
					style={[
						styles.tabs,
						{ backgroundColor: T.surface2, borderColor: T.border },
					]}
				>
					{(['active', 'used'] as const).map((tab) => (
						<TouchableOpacity
							key={tab}
							onPress={() => setActiveTab(tab)}
							style={[
								styles.tab,
								activeTab === tab && {
									backgroundColor: T.surface,
									shadowColor: '#000',
									shadowOpacity: 0.08,
									shadowRadius: 4,
									elevation: 2,
								},
							]}
							activeOpacity={0.75}
						>
							<Text
								style={[
									styles.tabText,
									{ color: activeTab === tab ? T.text : T.textSec },
								]}
							>
								{tab === 'active' ? 'Active Offers' : 'Used'}
							</Text>
						</TouchableOpacity>
					))}
				</View>

				{/* Promo cards */}
				{filtered.length === 0 ? (
					<View style={styles.empty}>
						<Text style={{ fontSize: 48 }}>🎁</Text>
						<Text style={[styles.emptyTitle, { color: T.text }]}>
							No {activeTab} promos
						</Text>
					</View>
				) : (
					filtered.map((promo) => (
						<View
							key={promo.id}
							style={[
								styles.promoCard,
								{
									backgroundColor: T.surface,
									borderColor: T.border,
									opacity: promo.used ? 0.6 : 1,
								},
							]}
						>
							{/* Left color strip */}
							<View
								style={[
									styles.colorStrip,
									{ backgroundColor: TYPE_COLOR[promo.type] },
								]}
							/>
							<View style={{ flex: 1, padding: 16 }}>
								<View style={styles.promoTop}>
									<View style={{ flex: 1 }}>
										<Text style={[styles.promoTitle, { color: T.text }]}>
											{promo.title}
										</Text>
										<Text style={[styles.promoDesc, { color: T.textSec }]}>
											{promo.description}
										</Text>
									</View>
									<View
										style={[
											styles.discountBadge,
											{ backgroundColor: `${TYPE_COLOR[promo.type]}18` },
										]}
									>
										<Text
											style={[
												styles.discountText,
												{ color: TYPE_COLOR[promo.type] },
											]}
										>
											{promo.discount}
										</Text>
									</View>
								</View>
								<View
									style={[styles.promoFooter, { borderTopColor: T.border }]}
								>
									<View style={styles.codeTag}>
										<Text
											style={[
												styles.codeTagText,
												{ color: T.textSec, backgroundColor: T.surface2 },
											]}
										>
											{promo.code}
										</Text>
									</View>
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 12,
										}}
									>
										<Text style={[styles.expiry, { color: T.textMuted }]}>
											Exp: {promo.expiry}
										</Text>
										{!promo.used && (
											<TouchableOpacity
												onPress={() => copyCode(promo.code)}
												hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
											>
												<MaterialIcons
													name="content-copy"
													size={16}
													color={T.primary}
												/>
											</TouchableOpacity>
										)}
									</View>
								</View>
							</View>
						</View>
					))
				)}
			</ScrollView>}
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
	inputCard: { borderRadius: 4, borderWidth: 1, padding: 16, gap: 12 },
	inputCardTitle: { fontSize: 15, fontWeight: '700' },
	inputRow: { flexDirection: 'row', gap: 10 },
	codeInput: {
		flex: 1,
		height: 44,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
		fontSize: 14,
		fontWeight: '700',
		letterSpacing: 1,
	},
	applyBtn: {
		height: 44,
		paddingHorizontal: 20,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
	tabs: {
		flexDirection: 'row',
		borderRadius: 4,
		borderWidth: 1,
		padding: 4,
		gap: 4,
	},
	tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 4 },
	tabText: { fontSize: 13, fontWeight: '600' },
	empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
	emptyTitle: { fontSize: 16, fontWeight: '700' },
	promoCard: {
		flexDirection: 'row',
		borderRadius: 4,
		borderWidth: 1,
		overflow: 'hidden',
	},
	colorStrip: { width: 5 },
	promoTop: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 12,
		marginBottom: 12,
	},
	promoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
	promoDesc: { fontSize: 12, lineHeight: 18 },
	discountBadge: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	discountText: { fontSize: 12, fontWeight: '800' },
	promoFooter: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		borderTopWidth: 1,
		paddingTop: 10,
	},
	codeTag: { flexDirection: 'row' },
	codeTagText: {
		fontSize: 12,
		fontWeight: '700',
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 4,
		letterSpacing: 0.5,
	},
	expiry: { fontSize: 11 },
});
