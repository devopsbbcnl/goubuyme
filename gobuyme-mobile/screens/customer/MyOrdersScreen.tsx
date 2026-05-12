import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	RefreshControl,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

type OrderStatus =
	| 'pending'
	| 'preparing'
	| 'ready'
	| 'on_the_way'
	| 'delivered'
	| 'cancelled';

type Order = {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	totalAmount: number;
	createdAt: string;
	vendor: { businessName: string };
	items: { name: string; quantity: number }[];
};

type RawOrder = {
	id: string;
	orderNumber: string;
	status: string;
	totalAmount: number;
	createdAt: string;
	vendor: { businessName: string };
	items: { name: string; quantity: number }[];
};

const STATUS_CONFIG: Record<
	OrderStatus,
	{ label: string; color: string; bg: string }
> = {
	pending: { label: 'Pending', color: '#F5A623', bg: 'rgba(245,166,35,0.12)' },
	preparing: {
		label: 'Preparing',
		color: '#F5A623',
		bg: 'rgba(245,166,35,0.12)',
	},
	ready: { label: 'Ready', color: '#2196F3', bg: 'rgba(33,150,243,0.12)' },
	on_the_way: {
		label: 'On The Way',
		color: '#FF521B',
		bg: 'rgba(255,82,27,0.12)',
	},
	delivered: {
		label: 'Delivered',
		color: '#1A9E5F',
		bg: 'rgba(26,158,95,0.12)',
	},
	cancelled: {
		label: 'Cancelled',
		color: '#E23B3B',
		bg: 'rgba(226,59,59,0.12)',
	},
};

const ACTIVE_STATUSES: OrderStatus[] = [
	'pending',
	'preparing',
	'ready',
	'on_the_way',
];

function toUiStatus(raw: string): OrderStatus {
	switch (raw) {
		case 'DELIVERED':
			return 'delivered';
		case 'CANCELLED':
			return 'cancelled';
		case 'PICKED_UP':
			return 'on_the_way';
		case 'READY':
			return 'ready';
		case 'ACCEPTED':
		case 'PREPARING':
			return 'preparing';
		default:
			return 'pending';
	}
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / 86400000);
	const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	if (diffDays === 0) return `Today, ${time}`;
	if (diffDays === 1) return `Yesterday, ${time}`;
	return `${d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}, ${time}`;
}

function summariseItems(items: { name: string; quantity: number }[]): string {
	return items.map((i) => `${i.name} × ${i.quantity}`).join(', ');
}

const TABS = ['All', 'Active', 'Delivered', 'Cancelled'] as const;
type Tab = (typeof TABS)[number];

export default function MyOrdersScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [activeTab, setActiveTab] = useState<Tab>('All');
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchOrders = useCallback(async (silent = false) => {
		if (!silent) setLoading(true);
		setError(null);
		try {
			const { data } = await api.get('/orders?limit=50');
			const raw: RawOrder[] = data.data ?? [];
			setOrders(raw.map((o) => ({ ...o, status: toUiStatus(o.status) })));
		} catch {
			setError('Could not load orders. Pull down to retry.');
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchOrders();
	}, [fetchOrders]);

	const onRefresh = () => {
		setRefreshing(true);
		fetchOrders(true);
	};

	const filtered = orders.filter((o) => {
		if (activeTab === 'Active')
			return (ACTIVE_STATUSES as string[]).includes(o.status);
		if (activeTab === 'Delivered') return o.status === 'delivered';
		if (activeTab === 'Cancelled') return o.status === 'cancelled';
		return true;
	});

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>My Orders</Text>
				<View style={{ width: 38 }} />
			</View>

			{/* Tabs */}
			<View style={[styles.tabsWrapper, { borderBottomColor: T.border }]}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.tabs}
				>
					{TABS.map((tab) => (
						<TouchableOpacity
							key={tab}
							onPress={() => setActiveTab(tab)}
							style={[
								styles.tab,
								{
									backgroundColor: activeTab === tab ? T.primary : T.surface2,
									borderColor: activeTab === tab ? T.primary : T.border,
								},
							]}
							activeOpacity={0.75}
						>
							<Text
								style={[
									styles.tabText,
									{ color: activeTab === tab ? '#fff' : T.textSec },
								]}
							>
								{tab}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
			</View>

			{loading ? (
				<View style={styles.centered}>
					<ActivityIndicator size="large" color={T.primary} />
				</View>
			) : error ? (
				<View style={styles.centered}>
					<Text style={{ fontSize: 36 }}>⚠️</Text>
					<Text style={[styles.emptyTitle, { color: T.text }]}>
						Something went wrong
					</Text>
					<Text style={[styles.emptySub, { color: T.textSec }]}>{error}</Text>
					<TouchableOpacity
						onPress={() => fetchOrders()}
						style={[styles.retryBtn, { backgroundColor: T.primary }]}
						activeOpacity={0.8}
					>
						<Text style={styles.retryText}>Retry</Text>
					</TouchableOpacity>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={styles.scroll}
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={T.primary}
						/>
					}
				>
					{filtered.length === 0 ? (
						<View style={styles.empty}>
							<Text style={{ fontSize: 48 }}>📦</Text>
							<Text style={[styles.emptyTitle, { color: T.text }]}>
								No orders here
							</Text>
							<Text style={[styles.emptySub, { color: T.textSec }]}>
								Your {activeTab.toLowerCase()} orders will appear here
							</Text>
						</View>
					) : (
						filtered.map((order) => {
							const cfg = STATUS_CONFIG[order.status];
							return (
								<TouchableOpacity
									key={order.id}
									activeOpacity={0.8}
									onPress={() =>
										(ACTIVE_STATUSES as string[]).includes(order.status) &&
										router.push({
											pathname: '/tracking',
											params: {
												orderId: order.id,
												orderNumber: order.orderNumber,
											},
										})
									}
									style={[
										styles.card,
										{ backgroundColor: T.surface, borderColor: T.border },
									]}
								>
									<View style={styles.cardTop}>
										<View>
											<Text style={[styles.orderId, { color: T.textSec }]}>
												{order.orderNumber}
											</Text>
											<Text style={[styles.vendorName, { color: T.text }]}>
												{order.vendor.businessName}
											</Text>
										</View>
										<View style={[styles.badge, { backgroundColor: cfg.bg }]}>
											<Text style={[styles.badgeText, { color: cfg.color }]}>
												{cfg.label}
											</Text>
										</View>
									</View>
									<Text style={[styles.items, { color: T.textSec }]}>
										{summariseItems(order.items)}
									</Text>
									<View style={styles.cardBottom}>
										<Text style={[styles.date, { color: T.textMuted }]}>
											{formatDate(order.createdAt)}
										</Text>
										<Text style={[styles.total, { color: T.text }]}>
											₦{order.totalAmount.toLocaleString()}
										</Text>
									</View>
									{order.status === 'delivered' && (
										<TouchableOpacity
											style={[styles.reorderBtn, { borderColor: T.primary }]}
											activeOpacity={0.75}
										>
											<Text style={[styles.reorderText, { color: T.primary }]}>
												Reorder
											</Text>
										</TouchableOpacity>
									)}
									{(ACTIVE_STATUSES as string[]).includes(order.status) && (
										<View
											style={[
												styles.trackBanner,
												{ backgroundColor: T.primaryTint },
											]}
										>
											<Ionicons name="location" size={14} color={T.primary} />
											<Text style={[styles.trackText, { color: T.primary }]}>
												Tap to track your order
											</Text>
										</View>
									)}
								</TouchableOpacity>
							);
						})
					)}
				</ScrollView>
			)}
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
	tabsWrapper: { height: 56, borderBottomWidth: 1 },
	tabs: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 10,
		gap: 8,
	},
	tab: {
		height: 36,
		paddingHorizontal: 18,
		borderRadius: 999,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	tabText: { fontSize: 13, fontWeight: '600' },
	scroll: { padding: 20, gap: 12, paddingBottom: 40 },
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 12,
	},
	empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
	emptyTitle: { fontSize: 17, fontWeight: '700' },
	emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
	retryBtn: {
		marginTop: 8,
		paddingHorizontal: 24,
		paddingVertical: 10,
		borderRadius: 4,
	},
	retryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
	card: { borderRadius: 4, borderWidth: 1, padding: 16, gap: 8 },
	cardTop: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
	},
	orderId: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
	vendorName: { fontSize: 15, fontWeight: '700' },
	badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
	badgeText: { fontSize: 11, fontWeight: '700' },
	items: { fontSize: 13 },
	cardBottom: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	date: { fontSize: 12 },
	total: { fontSize: 15, fontWeight: '700' },
	reorderBtn: {
		alignSelf: 'flex-start',
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 4,
		borderWidth: 1.5,
		marginTop: 4,
	},
	reorderText: { fontSize: 12, fontWeight: '700' },
	trackBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		padding: 8,
		borderRadius: 4,
		marginTop: 4,
	},
	trackText: { fontSize: 12, fontWeight: '600' },
});
