import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	RefreshControl,
	Alert,
	Modal,
	TextInput,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

type RawStatus =
	| 'PENDING'
	| 'ACCEPTED'
	| 'PREPARING'
	| 'READY'
	| 'PICKED_UP'
	| 'DELIVERED'
	| 'CANCELLED';

interface Order {
	id: string;
	orderNumber: string;
	customer: string;
	customerPhone: string | null;
	items: string[];
	total: number;
	status: RawStatus;
	createdAt: string;
}

const STATUS_META: Record<
	RawStatus,
	{ label: string; color: string; bg: string }
> = {
	PENDING: {
		label: 'New Order',
		color: '#F5A623',
		bg: 'rgba(245,166,35,0.12)',
	},
	ACCEPTED: {
		label: 'Accepted',
		color: '#1A6EFF',
		bg: 'rgba(26,110,255,0.12)',
	},
	PREPARING: {
		label: 'Preparing',
		color: '#1A6EFF',
		bg: 'rgba(26,110,255,0.12)',
	},
	READY: { label: 'Ready', color: '#1A9E5F', bg: 'rgba(26,158,95,0.12)' },
	PICKED_UP: {
		label: 'Picked Up',
		color: '#7C3AED',
		bg: 'rgba(124,58,237,0.12)',
	},
	DELIVERED: {
		label: 'Delivered',
		color: '#1A9E5F',
		bg: 'rgba(26,158,95,0.12)',
	},
	CANCELLED: {
		label: 'Cancelled',
		color: '#E23B3B',
		bg: 'rgba(226,59,59,0.12)',
	},
};

const ACTIVE_STATUSES: RawStatus[] = [
	'PENDING',
	'ACCEPTED',
	'PREPARING',
	'READY',
	'PICKED_UP',
];

const TABS = [
	{ key: 'ALL', label: 'All' },
	{ key: 'ACTIVE', label: 'Active' },
	{ key: 'PREPARING', label: 'Preparing' },
	{ key: 'READY', label: 'Ready' },
	{ key: 'DELIVERED', label: 'Delivered' },
	{ key: 'CANCELLED', label: 'Cancelled' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function formatDate(iso: string) {
	const d = new Date(iso);
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
	const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	if (diffDays === 0) return `Today, ${time}`;
	if (diffDays === 1) return `Yesterday, ${time}`;
	return `${d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function VendorOrdersScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [activeTab, setActiveTab] = useState<TabKey>('ALL');
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [acting, setActing] = useState<string | null>(null);
	const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [rejectSubmitting, setRejectSubmitting] = useState(false);

	const fetchOrders = useCallback(async (silent = false) => {
		if (!silent) setLoading(true);
		setError(null);
		try {
			const res = await api.get('/vendors/me/orders?status=ALL&limit=100');
			const raw: any[] = res.data.data ?? [];
			setOrders(
				raw.map((o) => ({
					id: o.id,
					orderNumber: o.orderNumber,
					customer: o.customer,
					customerPhone: o.customerPhone ?? null,
					items: o.items,
					total: o.total,
					status: o.status as RawStatus,
					createdAt: o.createdAt,
				})),
			);
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

	const handleAction = async (
		order: Order,
		action: 'accept' | 'ready',
	) => {
		setActing(order.id + action);
		try {
			await api.patch(`/vendors/me/orders/${order.id}/status`, { action });
			if (action === 'accept') {
				setOrders((prev) =>
					prev.map((o) =>
						o.id === order.id ? { ...o, status: 'PREPARING' } : o,
					),
				);
			} else {
				setOrders((prev) =>
					prev.map((o) => (o.id === order.id ? { ...o, status: 'READY' } : o)),
				);
			}
		} catch {
			Alert.alert('Error', 'Failed to update order. Try again.');
		} finally {
			setActing(null);
		}
	};

	const submitReject = async () => {
		if (!rejectTarget) return;
		setRejectSubmitting(true);
		try {
			await api.patch(`/vendors/me/orders/${rejectTarget.id}/status`, {
				action: 'reject',
				...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
			});
			setOrders((prev) =>
				prev.map((o) =>
					o.id === rejectTarget.id ? { ...o, status: 'CANCELLED' } : o,
				),
			);
			setRejectTarget(null);
			setRejectReason('');
		} catch {
			Alert.alert('Error', 'Failed to reject order. Try again.');
		} finally {
			setRejectSubmitting(false);
		}
	};

	const filtered = orders.filter((o) => {
		if (activeTab === 'ALL') return true;
		if (activeTab === 'ACTIVE')
			return (ACTIVE_STATUSES as string[]).includes(o.status);
		return o.status === activeTab;
	});

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}
			>
				<Text style={[styles.title, { color: T.text }]}>Orders</Text>
				<View style={[styles.countBadge, { backgroundColor: T.primaryTint }]}>
					<Text style={[styles.countText, { color: T.primary }]}>
						{orders.length}
					</Text>
				</View>
			</View>

			{/* Filter tabs */}
			<View style={[styles.tabsWrapper, { borderBottomColor: T.border }]}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.tabs}
				>
					{TABS.map((tab) => {
						const count =
							tab.key === 'ALL'
								? orders.length
								: tab.key === 'ACTIVE'
									? orders.filter((o) =>
											(ACTIVE_STATUSES as string[]).includes(o.status),
										).length
									: orders.filter((o) => o.status === tab.key).length;

						const isActive = activeTab === tab.key;
						return (
							<TouchableOpacity
								key={tab.key}
								onPress={() => setActiveTab(tab.key)}
								style={[
									styles.tab,
									{
										backgroundColor: isActive ? T.primary : T.surface2,
										borderColor: isActive ? T.primary : T.border,
									},
								]}
								activeOpacity={0.75}
							>
								<Text
									style={[
										styles.tabText,
										{ color: isActive ? '#fff' : T.textSec },
									]}
								>
									{tab.label}
								</Text>
								{count > 0 && (
									<View
										style={[
											styles.tabCount,
											{
												backgroundColor: isActive
													? 'rgba(255,255,255,0.25)'
													: T.primaryTint,
											},
										]}
									>
										<Text
											style={[
												styles.tabCountText,
												{ color: isActive ? '#fff' : T.primary },
											]}
										>
											{count}
										</Text>
									</View>
								)}
							</TouchableOpacity>
						);
					})}
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
							colors={[T.primary]}
						/>
					}
				>
					{filtered.length === 0 ? (
						<View style={styles.empty}>
							<Text style={{ fontSize: 48 }}>📭</Text>
							<Text style={[styles.emptyTitle, { color: T.text }]}>
								No orders
							</Text>
							<Text style={[styles.emptySub, { color: T.textSec }]}>
								{activeTab === 'ALL'
									? 'Orders will appear here once customers place them.'
									: `No ${activeTab.toLowerCase()} orders right now.`}
							</Text>
						</View>
					) : (
						filtered.map((order) => {
							const meta = STATUS_META[order.status];
							const isNew = order.status === 'PENDING';
							const isPreparing =
								order.status === 'PREPARING' || order.status === 'ACCEPTED';
							return (
								<View
									key={order.id}
									style={[
										styles.card,
										{ backgroundColor: T.surface, borderColor: T.border },
									]}
								>
									{/* Top row */}
									<View style={styles.cardTop}>
										<View style={{ flex: 1 }}>
											<Text style={[styles.orderNum, { color: T.text }]}>
												{order.orderNumber}
											</Text>
											<Text style={[styles.customer, { color: T.textSec }]}>
												{order.customer}
											</Text>
										</View>
										<View
											style={[styles.statusPill, { backgroundColor: meta.bg }]}
										>
											<Text style={[styles.statusText, { color: meta.color }]}>
												{meta.label}
											</Text>
										</View>
									</View>

									{/* Items */}
									<Text
										style={[styles.items, { color: T.textSec }]}
										numberOfLines={2}
									>
										{order.items.join(' · ')}
									</Text>

									{/* Bottom row */}
									<View style={styles.cardBottom}>
										<View>
											<Text style={[styles.total, { color: T.text }]}>
												₦{order.total.toLocaleString()}
											</Text>
											<Text style={[styles.date, { color: T.textMuted }]}>
												{formatDate(order.createdAt)}
											</Text>
										</View>

										<View style={styles.actions}>
											{isNew && (
												<>
													<TouchableOpacity
														onPress={() => handleAction(order, 'accept')}
														disabled={!!acting}
														style={[
															styles.actionBtn,
															{
																backgroundColor: T.primary,
																opacity:
																	acting === order.id + 'accept' ? 0.6 : 1,
															},
														]}
													>
														<Text style={styles.actionBtnText}>Accept</Text>
													</TouchableOpacity>
													<TouchableOpacity
														onPress={() => setRejectTarget(order)}
														disabled={!!acting}
														style={[
															styles.actionOutline,
															{ borderColor: T.border },
														]}
													>
														<Text
															style={[
																styles.actionOutlineText,
																{ color: T.error },
															]}
														>
															Reject
														</Text>
													</TouchableOpacity>
												</>
											)}
											{isPreparing && (
												<TouchableOpacity
													onPress={() => handleAction(order, 'ready')}
													disabled={!!acting}
													style={[
														styles.actionBtn,
														{
															backgroundColor: '#1A6EFF',
															opacity: acting === order.id + 'ready' ? 0.6 : 1,
														},
													]}
												>
													<Text style={styles.actionBtnText}>Mark Ready</Text>
												</TouchableOpacity>
											)}
											{order.status === 'READY' && (
												<View
													style={[
														styles.awaitingBadge,
														{ backgroundColor: 'rgba(26,158,95,0.12)' },
													]}
												>
													<Ionicons
														name="bicycle-outline"
														size={13}
														color="#1A9E5F"
													/>
													<Text
														style={[styles.awaitingText, { color: '#1A9E5F' }]}
													>
														Awaiting Rider
													</Text>
												</View>
											)}
											{order.status === 'PICKED_UP' && (
												<View
													style={[
														styles.awaitingBadge,
														{ backgroundColor: 'rgba(124,58,237,0.12)' },
													]}
												>
													<Ionicons
														name="navigate-outline"
														size={13}
														color="#7C3AED"
													/>
													<Text
														style={[styles.awaitingText, { color: '#7C3AED' }]}
													>
														On The Way
													</Text>
												</View>
											)}
										</View>
									</View>
								</View>
							);
						})
					)}
				</ScrollView>
			)}

			{/* Reject reason modal */}
			<Modal
				visible={!!rejectTarget}
				transparent
				animationType="fade"
				onRequestClose={() => !rejectSubmitting && (setRejectTarget(null), setRejectReason(''))}
			>
				<KeyboardAvoidingView
					style={styles.modalOverlay}
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				>
					<View style={[styles.modalBox, { backgroundColor: T.surface, borderColor: T.border }]}>
						<Text style={[styles.modalTitle, { color: T.text }]}>Reject Order</Text>
						<Text style={[styles.modalSub, { color: T.textSec }]}>
							{rejectTarget?.orderNumber} · Why are you rejecting this order?
						</Text>
						<TextInput
							style={[
								styles.modalInput,
								{ color: T.text, borderColor: T.border, backgroundColor: T.bg },
							]}
							placeholder="e.g. Out of stock, closing early…"
							placeholderTextColor={T.textMuted}
							value={rejectReason}
							onChangeText={setRejectReason}
							multiline
							maxLength={200}
							editable={!rejectSubmitting}
						/>
						<View style={styles.modalActions}>
							<TouchableOpacity
								onPress={() => { setRejectTarget(null); setRejectReason(''); }}
								disabled={rejectSubmitting}
								style={[styles.modalCancelBtn, { backgroundColor: T.surface2, borderColor: T.border }]}
							>
								<Text style={[styles.modalBtnText, { color: T.textSec }]}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={submitReject}
								disabled={rejectSubmitting}
								style={[styles.modalRejectBtn, { opacity: rejectSubmitting ? 0.6 : 1 }]}
							>
								{rejectSubmitting ? (
									<ActivityIndicator size="small" color="#fff" />
								) : (
									<Text style={[styles.modalBtnText, { color: '#fff' }]}>Reject Order</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 14,
		borderBottomWidth: 1,
	},
	title: { fontSize: 22, fontWeight: '800' },
	countBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
	countText: { fontSize: 12, fontWeight: '700' },
	tabsWrapper: { height: 56, borderBottomWidth: 1 },
	tabs: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 10,
		gap: 8,
	},
	tab: {
		height: 36,
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		gap: 6,
		borderRadius: 999,
		borderWidth: 1,
	},
	tabText: { fontSize: 13, fontWeight: '600' },
	tabCount: {
		borderRadius: 999,
		paddingHorizontal: 6,
		paddingVertical: 1,
		minWidth: 18,
		alignItems: 'center',
	},
	tabCountText: { fontSize: 11, fontWeight: '700' },
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 12,
	},
	scroll: { padding: 16, gap: 12, paddingBottom: 40 },
	empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
	emptyTitle: { fontSize: 17, fontWeight: '700' },
	emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
	retryBtn: {
		marginTop: 8,
		paddingHorizontal: 24,
		paddingVertical: 10,
		borderRadius: 4,
	},
	retryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
	card: { borderRadius: 4, borderWidth: 1, padding: 14, gap: 8 },
	cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
	orderNum: { fontSize: 14, fontWeight: '800' },
	customer: { fontSize: 12, marginTop: 2 },
	statusPill: { borderRadius: 4, paddingVertical: 3, paddingHorizontal: 9 },
	statusText: { fontSize: 11, fontWeight: '700' },
	items: { fontSize: 12, lineHeight: 18 },
	cardBottom: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	total: { fontSize: 16, fontWeight: '800' },
	date: { fontSize: 11, marginTop: 2 },
	actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
	actionBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 4 },
	actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
	actionOutline: {
		paddingVertical: 7,
		paddingHorizontal: 14,
		borderRadius: 4,
		borderWidth: 1,
	},
	actionOutlineText: { fontSize: 12, fontWeight: '700' },
	awaitingBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		paddingVertical: 7,
		paddingHorizontal: 10,
		borderRadius: 4,
	},
	awaitingText: { fontSize: 12, fontWeight: '700' },
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.55)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	modalBox: {
		width: '100%',
		borderRadius: 4,
		borderWidth: 1,
		padding: 20,
		gap: 14,
	},
	modalTitle: { fontSize: 16, fontWeight: '800' },
	modalSub: { fontSize: 12, marginTop: -6 },
	modalInput: {
		borderWidth: 1,
		borderRadius: 4,
		padding: 12,
		fontSize: 13,
		minHeight: 80,
		textAlignVertical: 'top',
	},
	modalActions: { flexDirection: 'row', gap: 10 },
	modalCancelBtn: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 1,
		minHeight: 40,
	},
	modalRejectBtn: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#E23B3B',
		minHeight: 40,
	},
	modalBtnText: { fontSize: 13, fontWeight: '700' },
});
