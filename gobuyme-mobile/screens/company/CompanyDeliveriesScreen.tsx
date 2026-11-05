import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';

interface FleetDelivery {
	id: string;
	orderNumber: string;
	status: string;
	deliveryFee: number;
	deliveryAddress: string;
	vendorName: string;
	riderName: string | null;
	createdAt: string;
}

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
	READY: 'Ready for pickup',
	PICKED_UP: 'On the way',
	DELIVERED: 'Delivered',
	CANCELLED: 'Cancelled',
};

export default function CompanyDeliveriesScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [items, setItems] = useState<FleetDelivery[]>([]);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const fetchPage = useCallback(async (nextPage: number) => {
		const res = await api.get('/company/me/deliveries', { params: { page: nextPage, limit: PAGE_SIZE } });
		const d = res.data.data;
		return { rows: d.deliveries as FleetDelivery[], total: d.total as number };
	}, []);

	const reload = useCallback(async () => {
		try {
			const { rows, total: t } = await fetchPage(1);
			setItems(rows);
			setTotal(t);
			setPage(1);
		} catch {
			// keep what we have
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [fetchPage]);

	useFocusEffect(
		useCallback(() => {
			reload();
		}, [reload]),
	);

	const loadMore = async () => {
		if (loadingMore || items.length >= total) return;
		try {
			setLoadingMore(true);
			const { rows } = await fetchPage(page + 1);
			setItems((prev) => [...prev, ...rows]);
			setPage((p) => p + 1);
		} catch {
			// next scroll retries
		} finally {
			setLoadingMore(false);
		}
	};

	return (
		<FlatList
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
			data={items}
			keyExtractor={(d) => d.id}
			onEndReached={loadMore}
			onEndReachedThreshold={0.4}
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={() => {
						setRefreshing(true);
						reload();
					}}
					tintColor={T.primary}
				/>
			}
			ListHeaderComponent={
				<View style={{ marginBottom: 16 }}>
					<Text style={[styles.title, { color: T.text }]}>Fleet deliveries</Text>
					<Text style={[styles.sub, { color: T.textSec }]}>Orders delivered by your riders, newest first.</Text>
				</View>
			}
			ListEmptyComponent={
				loading ? (
					<ActivityIndicator color={T.primary} style={{ marginTop: 32 }} />
				) : (
					<Text style={[styles.empty, { color: T.textMuted }]}>
						No deliveries yet. They show up here once your riders take jobs.
					</Text>
				)
			}
			ListFooterComponent={loadingMore ? <ActivityIndicator color={T.primary} style={{ marginVertical: 16 }} /> : null}
			renderItem={({ item: d }) => (
				<View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
					<View style={styles.top}>
						<Text style={[styles.order, { color: T.text }]}>#{d.orderNumber}</Text>
						<Text style={[styles.status, { color: d.status === 'DELIVERED' ? T.success : T.textSec }]}>
							{STATUS_LABEL[d.status] ?? d.status.replace(/_/g, ' ').toLowerCase()}
						</Text>
					</View>
					<Text style={[styles.line, { color: T.textSec }]} numberOfLines={1}>
						{d.vendorName} → {d.deliveryAddress}
					</Text>
					<View style={styles.top}>
						<Text style={[styles.line, { color: T.textMuted }]}>
							{d.riderName ?? 'Unassigned'} · {new Date(d.createdAt).toLocaleDateString()}
						</Text>
						<Text style={[styles.fee, { color: T.text }]}>₦{d.deliveryFee.toLocaleString()}</Text>
					</View>
				</View>
			)}
		/>
	);
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingBottom: 120 },
	title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' },
	sub: { fontSize: 13, marginTop: 4, fontFamily: 'PlusJakartaSans_400Regular' },
	empty: { fontSize: 13, textAlign: 'center', marginTop: 32, fontFamily: 'PlusJakartaSans_400Regular' },
	card: { borderWidth: 1, borderRadius: 4, padding: 14, marginBottom: 10, gap: 6 },
	top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	order: { fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
	status: { fontSize: 12, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
	line: { fontSize: 12, flexShrink: 1, fontFamily: 'PlusJakartaSans_400Regular' },
	fee: { fontSize: 13, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
