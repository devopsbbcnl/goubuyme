import React, { useState, useCallback, useEffect } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	RefreshControl,
	TextInput,
	Alert,
	Modal,
	FlatList,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import MfaCodeModal from '@/components/MfaCodeModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NIGERIAN_BANKS = [
	{ name: 'Access Bank', code: '044' },
	{ name: 'Fidelity Bank', code: '070' },
	{ name: 'First Bank', code: '011' },
	{ name: 'FCMB', code: '214' },
	{ name: 'GTBank', code: '058' },
	{ name: 'Kuda Bank', code: '090267' },
	{ name: 'OPay', code: '100004' },
	{ name: 'PalmPay', code: '100033' },
	{ name: 'Polaris Bank', code: '076' },
	{ name: 'Stanbic IBTC', code: '221' },
	{ name: 'Sterling Bank', code: '232' },
	{ name: 'UBA', code: '033' },
	{ name: 'Union Bank', code: '032' },
	{ name: 'Wema Bank', code: '035' },
	{ name: 'Zenith Bank', code: '057' },
];

interface PayoutAccount {
	bankName: string;
	accountNumber: string;
	accountName: string;
	isRegistered: boolean;
}

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const formatMoney = (n: number) => {
	if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
	return `₦${n.toLocaleString()}`;
};

const STATUS_COLOR: Record<string, string> = {
	COMPLETED: '#1A9E5F',
	PENDING: '#F5A623',
	CANCELLED: '#E23B3B',
};

interface EarningsSummary {
	todayEarnings: number;
	weeklyEarnings: number[];
	monthlyEarnings: number;
	allTimeEarnings: number;
	pendingPayout: number;
	totalDeliveries: number;
}

interface PayoutRecord {
	id: string;
	vendor: string;
	amount: number;
	time: string;
	status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
	orderId: string;
}

export default function RiderEarningsScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();

	const [summary, setSummary] = useState<EarningsSummary | null>(null);
	const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const [payoutAccount, setPayoutAccount] = useState<PayoutAccount | null>(null);
	const [showBankForm, setShowBankForm] = useState(false);
	const [showBankPicker, setShowBankPicker] = useState(false);
	const [accNumber, setAccNumber] = useState('');
	const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
	const [resolvedName, setResolvedName] = useState('');
	const [verifying, setVerifying] = useState(false);
	const [saving, setSaving] = useState(false);

	const [mfaEnabled, setMfaEnabled] = useState(false);
	const [mfaModal, setMfaModal] = useState(false);
	const [mfaLoading, setMfaLoading] = useState(false);

	const fetchData = useCallback(async () => {
		try {
			const [statsRes, deliveriesRes, accountRes, mfaRes] = await Promise.allSettled([
				api.get('/riders/me/stats'),
				api.get('/riders/me/deliveries'),
				api.get('/riders/me/payout-account'),
				api.get('/auth/mfa/status'),
			]);

			if (mfaRes.status === 'fulfilled') setMfaEnabled(mfaRes.value.data.data.mfaEnabled);
			if (statsRes.status === 'fulfilled') {
				const s = statsRes.value.data.data;
				setSummary({
					todayEarnings: s.todayEarnings ?? 0,
					weeklyEarnings: s.weeklyEarnings ?? Array(7).fill(0),
					monthlyEarnings: s.monthlyEarnings ?? 0,
					allTimeEarnings: s.allTimeEarnings ?? 0,
					pendingPayout: s.pendingPayout ?? 0,
					totalDeliveries: s.totalDeliveries ?? 0,
				});
			}
			if (deliveriesRes.status === 'fulfilled') {
				setPayouts(deliveriesRes.value.data.data ?? []);
			}
			if (accountRes.status === 'fulfilled' && accountRes.value.data.data) {
				setPayoutAccount(accountRes.value.data.data);
			}
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleRefresh = useCallback(() => {
		setRefreshing(true);
		fetchData();
	}, [fetchData]);

	const verifyAccount = async () => {
		if (!selectedBank || accNumber.length !== 10) {
			Alert.alert('Error', 'Select a bank and enter a 10-digit account number.');
			return;
		}
		setVerifying(true);
		try {
			const res = await api.get(`/payments/resolve-account?account_number=${accNumber}&bank_code=${selectedBank.code}`);
			setResolvedName(res.data.data.accountName);
		} catch {
			Alert.alert('Verification Failed', 'Could not verify account. Check the details and try again.');
		} finally {
			setVerifying(false);
		}
	};

	const saveBankAccount = async (mfaCode?: string) => {
		if (!selectedBank || !resolvedName) {
			Alert.alert('Error', 'Verify your account number first.');
			return;
		}
		if (mfaEnabled && !mfaCode) {
			setMfaModal(true);
			return;
		}
		mfaCode ? setMfaLoading(true) : setSaving(true);
		try {
			const res = await api.post(
				'/riders/me/payout-account',
				{ bankName: selectedBank.name, bankCode: selectedBank.code, accountNumber: accNumber, accountName: resolvedName },
				{ headers: mfaCode ? { 'X-MFA-Code': mfaCode } : {} },
			);
			setPayoutAccount(res.data.data);
			setShowBankForm(false);
			setAccNumber('');
			setSelectedBank(null);
			setResolvedName('');
			setMfaModal(false);
			Alert.alert('Saved!', 'Your payout account has been registered.');
		} catch (e: any) {
			Alert.alert('Error', e.response?.data?.message ?? 'Failed to save bank account. Please try again.');
		} finally {
			setSaving(false);
			setMfaLoading(false);
		}
	};

	if (loading) {
		return (
			<View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
				<ActivityIndicator color={T.primary} />
			</View>
		);
	}

	const weekData = summary?.weeklyEarnings ?? Array(7).fill(0);
	const maxVal = Math.max(...weekData, 1);
	const weeklyTotal = weekData.reduce((a, b) => a + b, 0);

	const summaryCards = [
		{ label: "Today", value: formatMoney(summary?.todayEarnings ?? 0), icon: '📅', color: '#1A6EFF' },
		{ label: 'This Week', value: formatMoney(weeklyTotal), icon: '📊', color: '#F5A623' },
		{ label: 'This Month', value: formatMoney(summary?.monthlyEarnings ?? 0), icon: '🗓️', color: T.primary },
		{ label: 'All Time', value: formatMoney(summary?.allTimeEarnings ?? 0), icon: '🏆', color: '#1A9E5F' },
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
				<Text style={[styles.title, { color: T.text }]}>Earnings</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
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
				{/* Pending payout banner */}
				{(summary?.pendingPayout ?? 0) > 0 && (
					<View style={[styles.pendingBanner, { backgroundColor: 'rgba(245,166,35,0.12)', borderColor: 'rgba(245,166,35,0.3)' }]}>
						<Ionicons name="time-outline" size={18} color="#F5A623" />
						<View style={{ flex: 1 }}>
							<Text style={[styles.pendingTitle, { color: '#F5A623' }]}>Pending Payout</Text>
							<Text style={[styles.pendingSub, { color: T.textSec }]}>
								{formatMoney(summary?.pendingPayout ?? 0)} will be transferred within 24 hrs
							</Text>
						</View>
					</View>
				)}

				{/* Summary grid */}
				<View style={styles.summaryGrid}>
					{summaryCards.map((card) => (
						<View
							key={card.label}
							style={[styles.summaryCard, { backgroundColor: T.surface, borderColor: T.border }]}
						>
							<Text style={{ fontSize: 20 }}>{card.icon}</Text>
							<Text style={[styles.summaryValue, { color: card.color }]}>{card.value}</Text>
							<Text style={[styles.summaryLabel, { color: T.textSec }]}>{card.label}</Text>
						</View>
					))}
				</View>

				{/* Weekly chart */}
				<View style={[styles.chartCard, { backgroundColor: T.surface, borderColor: T.border }]}>
					<View style={styles.chartHeader}>
						<Text style={[styles.chartTitle, { color: T.text }]}>Weekly Breakdown</Text>
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
											height: (v / maxVal) * 56,
											backgroundColor: i === new Date().getDay() - 1 ? '#1A9E5F' : 'rgba(26,158,95,0.25)',
										},
									]}
								/>
								<Text style={[styles.barLabel, { color: i === new Date().getDay() - 1 ? T.text : T.textMuted }]}>
									{WEEK_LABELS[i]}
								</Text>
							</View>
						))}
					</View>
					<View style={styles.chartFooter}>
						<Text style={[styles.chartFooterText, { color: T.textMuted }]}>
							{summary?.totalDeliveries ?? 0} total deliveries
						</Text>
					</View>
				</View>

				{/* Payout history */}
				<View>
					<Text style={[styles.sectionTitle, { color: T.text }]}>Payout History</Text>
					{payouts.length === 0 ? (
						<View style={[styles.emptyState, { backgroundColor: T.surface, borderColor: T.border }]}>
							<Text style={{ fontSize: 28 }}>💸</Text>
							<Text style={[styles.emptyText, { color: T.textSec }]}>No payouts yet</Text>
							<Text style={[styles.emptyHint, { color: T.textMuted }]}>
								Complete deliveries to start earning
							</Text>
						</View>
					) : (
						<View style={[styles.historyCard, { backgroundColor: T.surface, borderColor: T.border }]}>
							{payouts.map((p, i) => {
								const statusColor = STATUS_COLOR[p.status] ?? T.textSec;
								return (
									<View
										key={p.id}
										style={[
											styles.historyRow,
											{ borderBottomColor: T.border, borderBottomWidth: i < payouts.length - 1 ? 1 : 0 },
										]}
									>
										<View style={[styles.historyIcon, { backgroundColor: T.surface2 }]}>
											<Text style={{ fontSize: 16 }}>📦</Text>
										</View>
										<View style={{ flex: 1 }}>
											<Text style={[styles.historyVendor, { color: T.text }]}>{p.vendor}</Text>
											<Text style={[styles.historyMeta, { color: T.textSec }]}>
												{p.orderId} · {p.time}
											</Text>
										</View>
										<View style={{ alignItems: 'flex-end', gap: 4 }}>
											<Text style={[styles.historyAmount, { color: '#1A9E5F' }]}>
												+{formatMoney(p.amount)}
											</Text>
											<View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
												<Text style={[styles.statusText, { color: statusColor }]}>
													{p.status}
												</Text>
											</View>
										</View>
									</View>
								);
							})}
						</View>
					)}
				</View>

				{/* Payout Account */}
				<View>
					<View style={styles.sectionRow}>
						<Text style={[styles.sectionTitle, { color: T.text }]}>Payout Account</Text>
						{payoutAccount && (
							<TouchableOpacity onPress={() => { setShowBankForm(true); setResolvedName(''); }}>
								<Text style={[styles.editLink, { color: T.primary }]}>Update</Text>
							</TouchableOpacity>
						)}
					</View>

					{!showBankForm && payoutAccount ? (
						<View style={[styles.bankCard, { backgroundColor: T.surface, borderColor: T.border }]}>
							<Ionicons name="card-outline" size={20} color={T.primary} />
							<View style={{ flex: 1 }}>
								<Text style={[styles.bankName, { color: T.text }]}>{payoutAccount.bankName}</Text>
								<Text style={[styles.bankAccNumber, { color: T.textSec }]}>
									{payoutAccount.accountNumber} · {payoutAccount.accountName}
								</Text>
							</View>
							<View style={[styles.registeredBadge, { backgroundColor: 'rgba(26,158,95,0.12)' }]}>
								<Text style={[styles.registeredText, { color: '#1A9E5F' }]}>Active</Text>
							</View>
						</View>
					) : !showBankForm ? (
						<TouchableOpacity
							style={[styles.addBankBtn, { backgroundColor: T.surface, borderColor: T.border }]}
							onPress={() => setShowBankForm(true)}
							activeOpacity={0.8}
						>
							<Ionicons name="add-circle-outline" size={20} color={T.primary} />
							<Text style={[styles.addBankText, { color: T.primary }]}>Add Payout Account</Text>
						</TouchableOpacity>
					) : (
						<View style={[styles.bankFormCard, { backgroundColor: T.surface, borderColor: T.border }]}>
							<TouchableOpacity
								style={[styles.bankPickerBtn, { backgroundColor: T.surface2, borderColor: T.border }]}
								onPress={() => setShowBankPicker(true)}
							>
								<Text style={{ color: selectedBank ? T.text : T.textMuted, fontSize: 14 }}>
									{selectedBank ? selectedBank.name : 'Select Bank'}
								</Text>
								<Ionicons name="chevron-down" size={16} color={T.textMuted} />
							</TouchableOpacity>

							<TextInput
								value={accNumber}
								onChangeText={t => { setAccNumber(t.replace(/\D/g, '').slice(0, 10)); setResolvedName(''); }}
								placeholder="10-digit account number"
								placeholderTextColor={T.textMuted}
								keyboardType="numeric"
								maxLength={10}
								style={[styles.bankInput, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
							/>

							{resolvedName ? (
								<View style={[styles.resolvedRow, { backgroundColor: 'rgba(26,158,95,0.1)' }]}>
									<Ionicons name="checkmark-circle" size={16} color="#1A9E5F" />
									<Text style={[styles.resolvedName, { color: '#1A9E5F' }]}>{resolvedName}</Text>
								</View>
							) : null}

							<View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
								{!resolvedName ? (
									<TouchableOpacity
										style={[styles.formBtn, { backgroundColor: T.primary, flex: 1 }]}
										onPress={verifyAccount}
										disabled={verifying}
										activeOpacity={0.85}
									>
										{verifying
											? <ActivityIndicator size="small" color="#fff" />
											: <Text style={styles.formBtnText}>Verify</Text>}
									</TouchableOpacity>
								) : (
									<TouchableOpacity
										style={[styles.formBtn, { backgroundColor: '#1A9E5F', flex: 1 }]}
										onPress={saveBankAccount}
										disabled={saving}
										activeOpacity={0.85}
									>
										{saving
											? <ActivityIndicator size="small" color="#fff" />
											: <Text style={styles.formBtnText}>Save Account</Text>}
									</TouchableOpacity>
								)}
								<TouchableOpacity
									style={[styles.formBtn, { backgroundColor: T.surface2, borderWidth: 1, borderColor: T.border }]}
									onPress={() => { setShowBankForm(false); setAccNumber(''); setSelectedBank(null); setResolvedName(''); }}
								>
									<Text style={[styles.formBtnText, { color: T.textSec }]}>Cancel</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				</View>
			</ScrollView>

			<MfaCodeModal
				visible={mfaModal}
				onCancel={() => setMfaModal(false)}
				onConfirm={(code) => saveBankAccount(code)}
				loading={mfaLoading}
				title="Confirm Payout Account"
				subtitle="Enter your authenticator code to save this bank account."
			/>

			{/* Bank Picker Modal */}
			<Modal visible={showBankPicker} transparent animationType="slide">
				<TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBankPicker(false)} />
				<View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
					<Text style={[styles.modalTitle, { color: T.text }]}>Select Bank</Text>
					<FlatList
						data={NIGERIAN_BANKS}
						keyExtractor={b => b.code}
						renderItem={({ item }) => (
							<TouchableOpacity
								style={[styles.bankOption, { borderBottomColor: T.border }]}
								onPress={() => { setSelectedBank(item); setShowBankPicker(false); setResolvedName(''); }}
							>
								<Text style={[styles.bankOptionText, { color: T.text }]}>{item.name}</Text>
								{selectedBank?.code === item.code && (
									<Ionicons name="checkmark" size={18} color={T.primary} />
								)}
							</TouchableOpacity>
						)}
					/>
				</View>
			</Modal>
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
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	pendingBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 14,
		borderRadius: 4,
		borderWidth: 1,
	},
	pendingTitle: { fontSize: 13, fontWeight: '700' },
	pendingSub: { fontSize: 12, marginTop: 2 },
	summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
	summaryCard: { width: '47%', borderRadius: 4, borderWidth: 1, padding: 14, gap: 4 },
	summaryValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
	summaryLabel: { fontSize: 11 },
	chartCard: { borderRadius: 4, borderWidth: 1, padding: 14 },
	chartHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 14,
	},
	chartTitle: { fontSize: 13, fontWeight: '700' },
	chartTotal: { fontSize: 12, fontWeight: '700' },
	bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 72 },
	barCol: { flex: 1, alignItems: 'center', gap: 4 },
	bar: { width: '100%', borderRadius: 4, minHeight: 4 },
	barLabel: { fontSize: 9, fontWeight: '600' },
	chartFooter: { marginTop: 10, alignItems: 'center' },
	chartFooterText: { fontSize: 11 },
	sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
	emptyState: {
		alignItems: 'center',
		gap: 8,
		paddingVertical: 32,
		borderRadius: 4,
		borderWidth: 1,
	},
	emptyText: { fontSize: 14, fontWeight: '600' },
	emptyHint: { fontSize: 12 },
	historyCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
	historyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	historyIcon: {
		width: 40,
		height: 40,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	historyVendor: { fontSize: 13, fontWeight: '600' },
	historyMeta: { fontSize: 11, marginTop: 1 },
	historyAmount: { fontSize: 14, fontWeight: '800' },
	statusPill: { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
	statusText: { fontSize: 10, fontWeight: '700' },
	sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
	editLink: { fontSize: 13, fontWeight: '700' },
	bankCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 4, borderWidth: 1, padding: 14 },
	bankName: { fontSize: 14, fontWeight: '700' },
	bankAccNumber: { fontSize: 12, marginTop: 2 },
	registeredBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
	registeredText: { fontSize: 11, fontWeight: '700' },
	addBankBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', padding: 16 },
	addBankText: { fontSize: 14, fontWeight: '700' },
	bankFormCard: { borderRadius: 4, borderWidth: 1, padding: 14, gap: 12 },
	bankPickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 4, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
	bankInput: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
	resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 4, padding: 10 },
	resolvedName: { fontSize: 13, fontWeight: '700' },
	formBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
	formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
	modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
	modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '60%' },
	modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
	bankOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
	bankOptionText: { fontSize: 14, fontWeight: '500' },
});
