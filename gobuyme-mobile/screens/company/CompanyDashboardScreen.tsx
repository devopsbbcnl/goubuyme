import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface CompanyOverview {
	companyName: string;
	approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
	stats: { riders: number; online: number; openInvites: number; delivered: number; capacity: number };
}

const STATUS_COPY: Record<CompanyOverview['approvalStatus'], string> = {
	PENDING: 'Your company is being reviewed. You can invite riders as soon as it is approved.',
	APPROVED: 'Your company is approved. Riders you invite join your fleet automatically.',
	REJECTED: 'Your company could not be approved. Contact support to appeal.',
	SUSPENDED: 'Your company is suspended, so your riders cannot take deliveries. Contact support.',
};

export default function CompanyDashboardScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { user } = useAuth();
	const [data, setData] = useState<CompanyOverview | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [failed, setFailed] = useState(false);

	const load = useCallback(async () => {
		try {
			const res = await api.get('/company/me');
			setData(res.data.data);
			setFailed(false);
		} catch {
			setFailed(true);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			load();
		}, [load]),
	);

	const tiles = data
		? [
				{ label: 'Riders in fleet', value: data.stats.riders },
				{ label: 'Online now', value: data.stats.online },
				{ label: 'Open invites', value: data.stats.openInvites },
				{ label: 'Deliveries done', value: data.stats.delivered },
			]
		: [];

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={() => {
						setRefreshing(true);
						load();
					}}
					tintColor={T.primary}
				/>
			}
		>
			<Text style={[styles.hello, { color: T.textSec }]}>Welcome, {user?.name?.split(' ')[0] ?? 'there'}</Text>
			<Text style={[styles.title, { color: T.text }]}>{data?.companyName ?? 'Your company'}</Text>

			{loading ? (
				<ActivityIndicator color={T.primary} style={{ marginTop: 40 }} />
			) : failed || !data ? (
				<View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
					<Text style={[styles.cardText, { color: T.textSec }]}>
						We could not load your company. Pull down to try again.
					</Text>
				</View>
			) : (
				<>
					<View
						style={[
							styles.status,
							{
								backgroundColor: data.approvalStatus === 'APPROVED' ? T.successBg : T.warningBg,
								borderColor: data.approvalStatus === 'APPROVED' ? T.success : T.warning,
							},
						]}
					>
						<Ionicons
							name={data.approvalStatus === 'APPROVED' ? 'checkmark-circle' : 'time-outline'}
							size={18}
							color={data.approvalStatus === 'APPROVED' ? T.success : T.warning}
						/>
						<Text style={[styles.statusText, { color: T.text }]}>{STATUS_COPY[data.approvalStatus]}</Text>
					</View>

					<View style={styles.grid}>
						{tiles.map((t) => (
							<View key={t.label} style={[styles.tile, { backgroundColor: T.surface, borderColor: T.border }]}>
								<Text style={[styles.tileValue, { color: T.text }]}>{t.value}</Text>
								<Text style={[styles.tileLabel, { color: T.textSec }]}>{t.label}</Text>
							</View>
						))}
					</View>

					<TouchableOpacity
						activeOpacity={0.85}
						onPress={() => router.navigate('/(company)/fleet' as never)}
						style={[styles.cta, { backgroundColor: T.primary }]}
					>
						<Ionicons name="person-add-outline" size={18} color="#fff" />
						<Text style={styles.ctaText}>Invite a rider</Text>
					</TouchableOpacity>
					<Text style={[styles.capacity, { color: T.textMuted }]}>
						Your fleet can hold up to {data.stats.capacity} riders and open invites.
					</Text>
				</>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingBottom: 120 },
	hello: { fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium' },
	title: {
		fontSize: 26,
		fontWeight: '800',
		letterSpacing: -0.5,
		marginTop: 2,
		marginBottom: 20,
		fontFamily: 'PlusJakartaSans_800ExtraBold',
	},
	card: { borderWidth: 1, borderRadius: 4, padding: 16 },
	cardText: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
	status: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
		borderWidth: 1,
		borderRadius: 4,
		padding: 14,
		marginBottom: 16,
	},
	statusText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'PlusJakartaSans_500Medium' },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
	tile: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 4, padding: 16 },
	tileValue: { fontSize: 28, fontWeight: '800', fontFamily: 'PlusJakartaSans_800ExtraBold' },
	tileLabel: { fontSize: 12, marginTop: 2, fontFamily: 'PlusJakartaSans_500Medium' },
	cta: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		borderRadius: 4,
		paddingVertical: 14,
	},
	ctaText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
	capacity: { fontSize: 11, textAlign: 'center', marginTop: 10, fontFamily: 'PlusJakartaSans_400Regular' },
});
