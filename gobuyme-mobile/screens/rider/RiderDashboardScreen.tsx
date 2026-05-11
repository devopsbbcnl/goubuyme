import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Animated,
	ActivityIndicator,
	RefreshControl,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const formatMoney = (n: number) => {
	if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
	return `₦${n.toLocaleString()}`;
};

interface Stats {
	todayDeliveries: number;
	todayEarnings: number;
	rating: number;
	isOnline: boolean;
	nearbyJobs: number;
	weeklyEarnings: number[];
}

interface RecentDelivery {
	id: string;
	vendor: string;
	amount: number;
	time: string;
	rating: number;
}

export default function RiderDashboardScreen() {
	const { theme: T } = useTheme();
	const { user } = useAuth();

	const [riderName, setRiderName] = useState('');
	const [online, setOnline] = useState(false);
	const [stats, setStats] = useState<Stats | null>(null);
	const [recent, setRecent] = useState<RecentDelivery[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const rippleScale = useRef(new Animated.Value(1)).current;
	const rippleOpacity = useRef(new Animated.Value(0)).current;

	const startRipple = () => {
		rippleScale.setValue(1);
		rippleOpacity.setValue(0.6);
		Animated.parallel([
			Animated.timing(rippleScale, {
				toValue: 2.5,
				duration: 1200,
				useNativeDriver: true,
			}),
			Animated.timing(rippleOpacity, {
				toValue: 0,
				duration: 1200,
				useNativeDriver: true,
			}),
		]).start();
	};

	const loadData = useCallback(async () => {
		try {
			const [profileRes, statsRes, recentRes] = await Promise.allSettled([
				api.get('/riders/me'),
				api.get('/riders/me/stats'),
				api.get('/riders/me/deliveries'),
			]);

			if (profileRes.status === 'fulfilled') {
				const p = profileRes.value.data.data;
				setRiderName(p.user?.name ?? user?.name ?? '');
				setOnline(p.isOnline ?? false);
			}
			if (statsRes.status === 'fulfilled') {
				const s: Stats = statsRes.value.data.data;
				setStats(s);
				setOnline(s.isOnline);
			}
			if (recentRes.status === 'fulfilled') {
				setRecent(recentRes.value.data.data ?? []);
			}
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [user?.name]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleRefresh = useCallback(() => {
		setRefreshing(true);
		loadData();
	}, [loadData]);

	const toggleOnline = async () => {
		const prev = online;
		const next = !prev;
		setOnline(next);
		if (next) startRipple();
		try {
			await api.patch('/riders/me/online');
			// Refresh stats so nearbyJobs count is current
			const statsRes = await api.get('/riders/me/stats');
			setStats(statsRes.data.data);
		} catch {
			setOnline(prev);
		}
	};

	const weekData = stats?.weeklyEarnings ?? Array(7).fill(0);
	const maxVal = Math.max(...weekData, 1);
	const weeklyTotal = weekData.reduce((a, b) => a + b, 0);

	const todayStats = [
		{
			label: 'Deliveries',
			value: stats ? String(stats.todayDeliveries) : '–',
			icon: '📦',
			color: '#1A6EFF',
		},
		{
			label: 'Earned',
			value: stats ? formatMoney(stats.todayEarnings) : '–',
			icon: '💰',
			color: '#1A9E5F',
		},
		{
			label: 'Rating',
			value: stats ? (stats.rating ?? 0).toFixed(1) : '–',
			icon: '⭐',
			color: '#F5A623',
		},
		{
			label: 'Nearby jobs',
			value: stats ? String(stats.nearbyJobs) : '–',
			icon: '🔔',
			color: T.primary,
		},
	];

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
				<ActivityIndicator color={T.primary} size="large" />
			</View>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<ScrollView
				contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						tintColor={T.primary}
						colors={[T.primary]}
					/>
				}
			>
				{/* Header */}
				<View style={styles.header}>
					<View>
						<Text style={[styles.roleLine, { color: T.textSec }]}>
							Rider Dashboard
						</Text>
						<Text style={[styles.name, { color: T.text }]}>
							{riderName || user?.name || 'My Dashboard'}
						</Text>
					</View>
					<View style={styles.headerRight}>
						<View
							style={{
								position: 'relative',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{online && (
								<Animated.View
									style={[
										styles.ripple,
										{
											backgroundColor: 'rgba(26,158,95,0.25)',
											transform: [{ scale: rippleScale }],
											opacity: rippleOpacity,
										},
									]}
								/>
							)}
							<TouchableOpacity
								onPress={toggleOnline}
								style={[
									styles.onlineBtn,
									{
										backgroundColor: online
											? 'rgba(26,158,95,0.15)'
											: T.surface2,
										borderColor: online ? '#1A9E5F' : T.border,
									},
								]}
							>
								<View
									style={[
										styles.statusDot,
										{
											backgroundColor: online ? '#1A9E5F' : T.textMuted,
											shadowColor: online ? '#1A9E5F' : 'transparent',
											shadowOffset: { width: 0, height: 0 },
											shadowOpacity: 1,
											shadowRadius: 6,
										},
									]}
								/>
								<Text
									style={[
										styles.onlineBtnText,
										{ color: online ? '#1A9E5F' : T.textSec },
									]}
								>
									{online ? 'Online' : 'Offline'}
								</Text>
							</TouchableOpacity>
						</View>
						<View style={styles.riderAvatar}>
							<Text style={{ fontSize: 16 }}>🏍️</Text>
						</View>
					</View>
				</View>

				{/* Hero banner */}
				{online ? (
					<TouchableOpacity
						onPress={() => router.push('/(rider)/jobs')}
						style={[styles.heroBanner, { borderColor: 'rgba(26,158,95,0.3)' }]}
						activeOpacity={0.85}
					>
						<View
							style={{
								position: 'absolute',
								right: 20,
								top: 16,
								opacity: 0.15,
							}}
						>
							<Text style={{ fontSize: 60 }}>🗺️</Text>
						</View>
						<View style={styles.onlinePill}>
							<View style={styles.blinkDot} />
							<Text style={styles.onlinePillText}>
								{stats?.nearbyJobs
									? `${stats.nearbyJobs} order${stats.nearbyJobs !== 1 ? 's' : ''} nearby`
									: 'Checking for orders…'}
							</Text>
						</View>
						<Text style={styles.heroTitle}>New jobs available!</Text>
						<Text style={styles.heroSub}>Tap to see available deliveries</Text>
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								gap: 6,
								marginTop: 14,
							}}
						>
							<Text style={[styles.heroLink, { color: '#1A9E5F' }]}>
								View orders
							</Text>
							<Ionicons name="chevron-forward" size={12} color="#1A9E5F" />
						</View>
					</TouchableOpacity>
				) : (
					<View
						style={[
							styles.offlineCard,
							{ backgroundColor: T.surface, borderColor: T.border },
						]}
					>
						<Text style={{ fontSize: 36, marginBottom: 8 }}>😴</Text>
						<Text style={[styles.offlineTitle, { color: T.text }]}>
							You're offline
						</Text>
						<Text style={[styles.offlineSub, { color: T.textSec }]}>
							Go online to start receiving delivery jobs
						</Text>
						<TouchableOpacity
							onPress={toggleOnline}
							style={[styles.goOnlineBtn, { backgroundColor: T.primary }]}
						>
							<Text style={styles.goOnlineBtnText}>Go Online</Text>
						</TouchableOpacity>
					</View>
				)}

				{/* Today stats */}
				<View style={styles.statsGrid}>
					{todayStats.map((s) => (
						<View
							key={s.label}
							style={[
								styles.statCard,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							<Text style={{ fontSize: 20 }}>{s.icon}</Text>
							<Text style={[styles.statValue, { color: s.color }]}>
								{s.value}
							</Text>
							<Text style={[styles.statLabel, { color: T.textSec }]}>
								{s.label} today
							</Text>
						</View>
					))}
				</View>

				{/* Weekly earnings chart */}
				<View
					style={[
						styles.chartCard,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<View style={styles.chartHeader}>
						<Text style={[styles.chartTitle, { color: T.text }]}>
							Weekly Earnings
						</Text>
						<Text style={[styles.chartTotal, { color: '#1A9E5F' }]}>
							{formatMoney(weeklyTotal)} total
						</Text>
					</View>
					<View style={styles.bars}>
						{weekData.map((v, i) => (
							<View key={i} style={styles.barCol}>
								<View
									style={[
										styles.bar,
										{
											height: (v / maxVal) * 48,
											backgroundColor:
												i === 6 ? '#1A9E5F' : 'rgba(26,158,95,0.3)',
										},
									]}
								/>
								<Text
									style={[
										styles.barLabel,
										{ color: i === 6 ? T.text : T.textMuted },
									]}
								>
									{WEEK_LABELS[i]}
								</Text>
							</View>
						))}
					</View>
				</View>

				{/* Recent deliveries */}
				<View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
					<Text style={[styles.sectionTitle, { color: T.text }]}>
						Recent Deliveries
					</Text>
					{recent.length === 0 ? (
						<View
							style={[
								styles.emptyState,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							<Text style={{ fontSize: 28 }}>📭</Text>
							<Text style={[styles.emptyText, { color: T.textSec }]}>
								No deliveries yet
							</Text>
						</View>
					) : (
						recent.map((d, i) => (
							<View
								key={d.id}
								style={[
									styles.deliveryRow,
									{
										borderBottomColor: T.border,
										borderBottomWidth: i < recent.length - 1 ? 1 : 0,
									},
								]}
							>
								<View
									style={[styles.deliveryIcon, { backgroundColor: T.surface2 }]}
								>
									<Text style={{ fontSize: 18 }}>📦</Text>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.deliveryVendor, { color: T.text }]}>
										{d.vendor}
									</Text>
									<Text style={[styles.deliveryMeta, { color: T.textSec }]}>
										{d.id} · {d.time}
									</Text>
								</View>
								<View style={{ alignItems: 'flex-end' }}>
									<Text style={[styles.deliveryAmount, { color: '#1A9E5F' }]}>
										+{formatMoney(d.amount)}
									</Text>
									{d.rating > 0 && (
										<View
											style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}
										>
											{Array.from({ length: d.rating }).map((_, j) => (
												<Ionicons
													key={j}
													name="star"
													size={10}
													color={T.star}
												/>
											))}
										</View>
									)}
								</View>
							</View>
						))
					)}
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
	},
	roleLine: { fontSize: 12 },
	name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
	headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	ripple: { position: 'absolute', width: 48, height: 48, borderRadius: 24 },
	onlineBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		borderWidth: 1.5,
		borderRadius: 999,
		paddingVertical: 7,
		paddingHorizontal: 16,
		zIndex: 1,
	},
	statusDot: { width: 8, height: 8, borderRadius: 4 },
	onlineBtnText: { fontSize: 13, fontWeight: '700' },
	riderAvatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: '#1A6EFF',
		alignItems: 'center',
		justifyContent: 'center',
	},
	heroBanner: {
		marginHorizontal: 20,
		marginTop: 16,
		borderRadius: 4,
		backgroundColor: '#0D2B1A',
		padding: 20,
		borderWidth: 1,
		position: 'relative',
		overflow: 'hidden',
	},
	onlinePill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		backgroundColor: 'rgba(26,158,95,0.2)',
		borderRadius: 999,
		paddingVertical: 4,
		paddingHorizontal: 12,
		alignSelf: 'flex-start',
		marginBottom: 10,
	},
	blinkDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: '#1A9E5F',
	},
	onlinePillText: { fontSize: 11, fontWeight: '700', color: '#1A9E5F' },
	heroTitle: {
		fontSize: 18,
		fontWeight: '800',
		color: '#fff',
		letterSpacing: -0.3,
	},
	heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
	heroLink: { fontSize: 12, fontWeight: '700' },
	offlineCard: {
		marginHorizontal: 20,
		marginTop: 16,
		borderRadius: 4,
		padding: 20,
		alignItems: 'center',
		borderWidth: 1,
	},
	offlineTitle: { fontSize: 16, fontWeight: '700' },
	offlineSub: { fontSize: 13, marginTop: 4, textAlign: 'center' },
	goOnlineBtn: {
		marginTop: 14,
		paddingVertical: 12,
		paddingHorizontal: 32,
		borderRadius: 4,
	},
	goOnlineBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
	statsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 10,
		paddingHorizontal: 20,
		paddingTop: 16,
	},
	statCard: { width: '47%', borderRadius: 4, padding: 14, borderWidth: 1 },
	statValue: {
		fontSize: 20,
		fontWeight: '800',
		marginTop: 6,
		letterSpacing: -0.5,
	},
	statLabel: { fontSize: 11, marginTop: 1 },
	chartCard: {
		marginHorizontal: 20,
		marginTop: 14,
		borderRadius: 4,
		padding: 14,
		borderWidth: 1,
	},
	chartHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 12,
	},
	chartTitle: { fontSize: 13, fontWeight: '700' },
	chartTotal: { fontSize: 12, fontWeight: '700' },
	bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64 },
	barCol: { flex: 1, alignItems: 'center', gap: 4 },
	bar: { width: '100%', borderRadius: 4, minHeight: 4 },
	barLabel: { fontSize: 9, fontWeight: '600' },
	sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
	emptyState: {
		alignItems: 'center',
		gap: 8,
		paddingVertical: 28,
		borderRadius: 4,
		borderWidth: 1,
	},
	emptyText: { fontSize: 13 },
	deliveryRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 12,
	},
	deliveryIcon: {
		width: 40,
		height: 40,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	deliveryVendor: { fontSize: 13, fontWeight: '600' },
	deliveryMeta: { fontSize: 11, marginTop: 1 },
	deliveryAmount: { fontSize: 14, fontWeight: '800' },
});
