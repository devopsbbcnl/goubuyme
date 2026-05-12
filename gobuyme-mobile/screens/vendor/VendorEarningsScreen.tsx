import React, { useState, useEffect, useCallback } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadows } from '@/theme';
import api from '@/services/api';
import MfaCodeModal from '@/components/MfaCodeModal';

interface Earnings {
  thisMonth: { amount: number; orders: number };
  pendingPayout: number;
  allTime: { amount: number; orders: number };
}

interface Stats {
  weeklyOrders: number[];
  todayRevenue: number;
}

interface Transaction {
  id: string;
  orderNumber: string;
  customer: string;
  total: number;
  createdAt: string;
  status: string;
}

const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

interface TierInfo {
  commissionTier: 'TIER_1' | 'TIER_2';
  tierChangedAt: string | null;
}

const TIER_META = {
  TIER_1: {
    name: 'Standard Plan',
    platformRate: '3%',
    vendorRate: '97%',
    color: '#1A9E5F',
    bullets: [
      'You keep 97% of every order subtotal',
      'Platform commission is 3% per order',
      'Standard search ranking on the app',
      'Best for established vendors with a loyal customer base',
    ],
  },
  TIER_2: {
    name: 'Growth Plan',
    platformRate: '7.5%',
    vendorRate: '92.5%',
    color: '#FF521B',
    bullets: [
      'You keep 92.5% of every order subtotal',
      'Platform commission is 7.5% per order',
      'Priority placement in search and featured sections',
      'Best for vendors looking to grow their customer base',
    ],
  },
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}k`;
  return `₦${n.toLocaleString()}`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function VendorEarningsScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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

  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [showTierModal, setShowTierModal] = useState(false);
  const [switchingTier, setSwitchingTier] = useState(false);

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaModal, setMfaModal] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [earningsRes, statsRes, ordersRes, accountRes, profileRes, mfaRes] = await Promise.allSettled([
        api.get('/vendors/me/earnings'),
        api.get('/vendors/me/stats'),
        api.get('/vendors/me/orders'),
        api.get('/vendors/me/payout-account'),
        api.get('/vendors/me'),
        api.get('/auth/mfa/status'),
      ]);

      if (mfaRes.status === 'fulfilled') setMfaEnabled(mfaRes.value.data.data.mfaEnabled);
      if (earningsRes.status === 'fulfilled') setEarnings(earningsRes.value.data.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data);
      if (ordersRes.status === 'fulfilled') {
        const all: Transaction[] = ordersRes.value.data.data ?? [];
        setTransactions(all.filter((o) => o.status === 'DELIVERED').slice(0, 20));
      }
      if (accountRes.status === 'fulfilled' && accountRes.value.data.data) {
        setPayoutAccount(accountRes.value.data.data);
      }
      if (profileRes.status === 'fulfilled') {
        const d = profileRes.value.data.data;
        setTierInfo({ commissionTier: d.commissionTier, tierChangedAt: d.tierChangedAt ?? null });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const targetTier: 'TIER_1' | 'TIER_2' = tierInfo?.commissionTier === 'TIER_1' ? 'TIER_2' : 'TIER_1';
  const daysLeft = tierInfo?.tierChangedAt
    ? Math.max(0, Math.ceil(14 - (Date.now() - new Date(tierInfo.tierChangedAt).getTime()) / 86_400_000))
    : 0;
  const canSwitch = daysLeft === 0;

  const switchTier = async () => {
    setSwitchingTier(true);
    try {
      const res = await api.patch('/vendors/me/tier', { tier: targetTier });
      const d = res.data.data;
      setTierInfo({ commissionTier: d.commissionTier, tierChangedAt: d.tierChangedAt ?? null });
      setShowTierModal(false);
      Alert.alert('Plan Updated', `You are now on the ${TIER_META[targetTier].name}.`);
    } catch (err: any) {
      setShowTierModal(false);
      Alert.alert('Switch Failed', err?.response?.data?.message ?? 'Could not switch plan. Please try again.');
    } finally {
      setSwitchingTier(false);
    }
  };

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
        '/vendors/me/payout-account',
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
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    );
  }

  const weekData = stats?.weeklyOrders ?? Array(7).fill(0);
  const maxVal = Math.max(...weekData, 1);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.primary} colors={[T.primary]} />
        }
      >
        {/* Header */}
        <View style={[styles.headerRow, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={T.text} />
          </TouchableOpacity>
          <Text style={[styles.pageTitle, { color: T.text }]}>Earnings</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Hero — All Time */}
        <View style={[styles.heroCard, { backgroundColor: T.primary, ...shadows.primaryGlow(T.primary) }]}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>ALL TIME</Text>
          </View>
          <Text style={styles.heroValue}>{fmt(earnings?.allTime.amount ?? 0)}</Text>
          <Text style={styles.heroSub}>
            {earnings?.allTime.orders ?? 0} completed orders
          </Text>
        </View>

        {/* This Month + Pending Payout */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: T.surface, borderColor: T.border }]}>
            <View style={[styles.statIconBox, { backgroundColor: T.successBg }]}>
              <Text style={{ fontSize: 18 }}>📅</Text>
            </View>
            <Text style={[styles.statLabel, { color: T.textSec }]}>This Month</Text>
            <Text style={[styles.statValue, { color: T.success }]}>
              {fmt(earnings?.thisMonth.amount ?? 0)}
            </Text>
            <Text style={[styles.statSub, { color: T.textMuted }]}>
              {earnings?.thisMonth.orders ?? 0} orders
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: T.surface, borderColor: T.border }]}>
            <View style={[styles.statIconBox, { backgroundColor: T.warningBg }]}>
              <Text style={{ fontSize: 18 }}>⏳</Text>
            </View>
            <Text style={[styles.statLabel, { color: T.textSec }]}>Pending Payout</Text>
            <Text style={[styles.statValue, { color: T.warning }]}>
              {fmt(earnings?.pendingPayout ?? 0)}
            </Text>
            <Text style={[styles.statSub, { color: T.textMuted }]}>
              Paid out automatically
            </Text>
          </View>
        </View>

        {/* Weekly activity chart */}
        <View style={[styles.chartCard, { backgroundColor: T.surface, borderColor: T.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.sectionTitle, { color: T.text }]}>Weekly Orders</Text>
            <Text style={[styles.chartSub, { color: T.textSec }]}>This week</Text>
          </View>
          <View style={styles.bars}>
            {weekData.map((v, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[
                  styles.bar,
                  { height: Math.max((v / maxVal) * 52, 4), backgroundColor: i === 6 ? T.primary : `${T.primary}44` },
                ]} />
                <Text style={[styles.barLabel, { color: i === 6 ? T.text : T.textMuted }]}>
                  {WEEK_LABELS[i]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={[styles.sectionTitle, { color: T.text, marginBottom: 12 }]}>
            Recent Transactions
          </Text>

          {transactions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: T.surface, borderColor: T.border }]}>
              <Text style={{ fontSize: 28, textAlign: 'center' }}>📭</Text>
              <Text style={[styles.emptyText, { color: T.textSec }]}>
                No completed orders yet
              </Text>
            </View>
          ) : (
            transactions.map((tx, i) => (
              <View
                key={tx.id}
                style={[
                  styles.txRow,
                  {
                    backgroundColor: T.surface,
                    borderColor: T.border,
                    borderBottomWidth: i < transactions.length - 1 ? 0 : 1,
                    borderTopWidth: 1,
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderTopLeftRadius: i === 0 ? 4 : 0,
                    borderTopRightRadius: i === 0 ? 4 : 0,
                    borderBottomLeftRadius: i === transactions.length - 1 ? 4 : 0,
                    borderBottomRightRadius: i === transactions.length - 1 ? 4 : 0,
                  },
                ]}
              >
                <View style={[styles.txIconBox, { backgroundColor: T.successBg }]}>
                  <Ionicons name="bag-check-outline" size={16} color={T.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txOrderNum, { color: T.text }]}>
                    {tx.orderNumber}
                  </Text>
                  <Text style={[styles.txCustomer, { color: T.textSec }]}>
                    {tx.customer} · {fmtDate(tx.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: T.success }]}>
                  +{fmt(tx.total)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Payout Account */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
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
                style={[styles.bankPickerBtn, { backgroundColor: T.bg, borderColor: T.border }]}
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
                style={[styles.bankInput, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]}
              />

              {resolvedName ? (
                <View style={[styles.resolvedRow, { backgroundColor: 'rgba(26,158,95,0.1)' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#1A9E5F" />
                  <Text style={[styles.resolvedNameText, { color: '#1A9E5F' }]}>{resolvedName}</Text>
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
                  style={[styles.formBtn, { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border }]}
                  onPress={() => { setShowBankForm(false); setAccNumber(''); setSelectedBank(null); setResolvedName(''); }}
                >
                  <Text style={[styles.formBtnText, { color: T.textSec }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Commission Plan */}
        {tierInfo && (
          <View style={{ paddingHorizontal: 20, marginTop: 24, marginBottom: 8 }}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: T.text }]}>Commission Plan</Text>
            </View>

            <View style={[styles.tierCard, { backgroundColor: T.surface, borderColor: T.border }]}>
              <View style={[styles.tierBadge, { backgroundColor: `${TIER_META[tierInfo.commissionTier].color}18` }]}>
                <Text style={[styles.tierBadgeText, { color: TIER_META[tierInfo.commissionTier].color }]}>
                  {TIER_META[tierInfo.commissionTier].name.toUpperCase()}
                </Text>
              </View>

              <View style={styles.tierRateRow}>
                <View style={styles.tierRateItem}>
                  <Text style={[styles.tierRateValue, { color: T.success }]}>
                    {TIER_META[tierInfo.commissionTier].vendorRate}
                  </Text>
                  <Text style={[styles.tierRateLabel, { color: T.textSec }]}>You keep</Text>
                </View>
                <View style={[styles.tierDivider, { backgroundColor: T.border }]} />
                <View style={styles.tierRateItem}>
                  <Text style={[styles.tierRateValue, { color: T.textSec }]}>
                    {TIER_META[tierInfo.commissionTier].platformRate}
                  </Text>
                  <Text style={[styles.tierRateLabel, { color: T.textSec }]}>Platform fee</Text>
                </View>
              </View>

              {!canSwitch ? (
                <View style={[styles.cooldownBanner, { backgroundColor: T.warningBg }]}>
                  <Ionicons name="time-outline" size={14} color={T.warning} />
                  <Text style={[styles.cooldownText, { color: T.warning }]}>
                    Next plan change available in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.switchBtn, { backgroundColor: T.primary }]}
                  onPress={() => setShowTierModal(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.switchBtnText}>
                    Switch to {TIER_META[targetTier].name}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
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

      {/* Tier Switch Modal */}
      {tierInfo && (
        <Modal visible={showTierModal} transparent animationType="slide">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { if (!switchingTier) setShowTierModal(false); }}
          />
          <View style={[styles.tierModalSheet, { backgroundColor: T.surface }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>Switch Commission Plan</Text>
            <Text style={[styles.tierModalSub, { color: T.textSec }]}>
              Review the details below before confirming your plan change.
            </Text>

            {/* Current plan */}
            <View style={[styles.tierCompareCard, { backgroundColor: T.bg, borderColor: T.border }]}>
              <View style={[styles.tierCompareChip, { backgroundColor: `${T.textMuted}22` }]}>
                <Text style={[styles.tierCompareChipText, { color: T.textMuted }]}>CURRENT PLAN</Text>
              </View>
              <Text style={[styles.tierCompareName, { color: T.text }]}>
                {TIER_META[tierInfo.commissionTier].name}
              </Text>
              <Text style={[styles.tierCompareRate, { color: T.textSec }]}>
                You keep {TIER_META[tierInfo.commissionTier].vendorRate} · Platform takes {TIER_META[tierInfo.commissionTier].platformRate}
              </Text>
            </View>

            <View style={styles.tierArrowRow}>
              <View style={[styles.tierArrowLine, { backgroundColor: T.border }]} />
              <View style={[styles.tierArrowCircle, { backgroundColor: T.primaryTint }]}>
                <Ionicons name="arrow-down" size={16} color={T.primary} />
              </View>
              <View style={[styles.tierArrowLine, { backgroundColor: T.border }]} />
            </View>

            {/* Target plan */}
            <View style={[
              styles.tierCompareCard,
              { backgroundColor: `${TIER_META[targetTier].color}0D`, borderColor: `${TIER_META[targetTier].color}44` },
            ]}>
              <View style={[styles.tierCompareChip, { backgroundColor: `${TIER_META[targetTier].color}22` }]}>
                <Text style={[styles.tierCompareChipText, { color: TIER_META[targetTier].color }]}>SWITCHING TO</Text>
              </View>
              <Text style={[styles.tierCompareName, { color: T.text }]}>
                {TIER_META[targetTier].name}
              </Text>
              <Text style={[styles.tierCompareRate, { color: T.textSec }]}>
                You keep {TIER_META[targetTier].vendorRate} · Platform takes {TIER_META[targetTier].platformRate}
              </Text>
            </View>

            {/* What changes */}
            <Text style={[styles.tierWhatTitle, { color: T.text }]}>What this means</Text>
            {TIER_META[targetTier].bullets.map((b, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: TIER_META[targetTier].color }]} />
                <Text style={[styles.bulletText, { color: T.textSec }]}>{b}</Text>
              </View>
            ))}

            {/* 14-day cooldown warning */}
            <View style={[styles.cooldownWarning, { backgroundColor: T.warningBg }]}>
              <Ionicons name="warning-outline" size={15} color={T.warning} />
              <Text style={[styles.cooldownWarningText, { color: T.warning }]}>
                After switching, you cannot change your plan again for 14 days.
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.tierModalBtns}>
              <TouchableOpacity
                style={[styles.tierModalBtn, { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border }]}
                onPress={() => setShowTierModal(false)}
                disabled={switchingTier}
              >
                <Text style={[styles.tierModalBtnText, { color: T.textSec }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tierModalBtn, { backgroundColor: T.primary, flex: 1 }]}
                onPress={switchTier}
                disabled={switchingTier}
                activeOpacity={0.85}
              >
                {switchingTier
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.tierModalBtnText}>Confirm Switch</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { fontSize: 18, fontWeight: '800' },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 4,
    padding: 24,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  heroValue: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 4,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statSub: { fontSize: 11 },
  chartCard: {
    marginHorizontal: 20,
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  chartSub: { fontSize: 11 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 68,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 9, fontWeight: '600' },
  emptyCard: {
    borderRadius: 4,
    borderWidth: 1,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 13 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  txIconBox: {
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txOrderNum: { fontSize: 13, fontWeight: '700' },
  txCustomer: { fontSize: 11, marginTop: 1 },
  txAmount: { fontSize: 14, fontWeight: '800' },
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
  resolvedNameText: { fontSize: 13, fontWeight: '700' },
  formBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  formBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  bankOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  bankOptionText: { fontSize: 14, fontWeight: '500' },

  // Commission Plan
  tierCard: { borderRadius: 4, borderWidth: 1, padding: 16, gap: 14 },
  tierBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  tierBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tierRateRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  tierRateItem: { flex: 1, alignItems: 'center', gap: 2 },
  tierRateValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  tierRateLabel: { fontSize: 11, fontWeight: '600' },
  tierDivider: { width: 1, height: 36, marginHorizontal: 8 },
  cooldownBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 12 },
  cooldownText: { fontSize: 12, fontWeight: '600', flex: 1 },
  switchBtn: { borderRadius: 4, paddingVertical: 13, alignItems: 'center' },
  switchBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Tier Modal
  tierModalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '88%' },
  tierModalSub: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  tierCompareCard: { borderRadius: 4, borderWidth: 1, padding: 14, gap: 6, marginBottom: 0 },
  tierCompareChip: { alignSelf: 'flex-start', borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7, marginBottom: 2 },
  tierCompareChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  tierCompareName: { fontSize: 16, fontWeight: '800' },
  tierCompareRate: { fontSize: 12, lineHeight: 17 },
  tierArrowRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  tierArrowLine: { flex: 1, height: 1 },
  tierArrowCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  tierWhatTitle: { fontSize: 13, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  bulletText: { fontSize: 13, flex: 1, lineHeight: 18 },
  cooldownWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 4, padding: 12, marginTop: 14 },
  cooldownWarningText: { fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
  tierModalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  tierModalBtn: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  tierModalBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
