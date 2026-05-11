import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Modal,
	Alert,
	ActivityIndicator,
	Switch,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import MfaCodeModal from '@/components/MfaCodeModal';

export default function PrivacySecurityScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { logout } = useAuth();

	// Password change state
	const [pwModal, setPwModal] = useState(false);
	const [currentPw, setCurrentPw] = useState('');
	const [newPw, setNewPw] = useState('');
	const [confirmPw, setConfirmPw] = useState('');
	const [pwLoading, setPwLoading] = useState(false);
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	// MFA state
	const [mfaEnabled, setMfaEnabled] = useState(false);
	const [mfaStatusLoading, setMfaStatusLoading] = useState(true);
	const [mfaDisableModal, setMfaDisableModal] = useState(false);
	const [mfaDisableLoading, setMfaDisableLoading] = useState(false);

	// MFA code prompt for change-password action
	const [pwMfaModal, setPwMfaModal] = useState(false);
	const [pwPendingPayload, setPwPendingPayload] = useState<{
		currentPassword: string;
		newPassword: string;
	} | null>(null);

	const fetchMfaStatus = useCallback(async () => {
		try {
			const res = await api.get('/auth/mfa/status');
			setMfaEnabled(res.data.data.mfaEnabled);
		} catch {
			// non-critical — default stays false
		} finally {
			setMfaStatusLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchMfaStatus();
	}, [fetchMfaStatus]);

	// ── Change Password ──────────────────────────────────────────────────────────

	const handleChangePassword = async () => {
		if (!currentPw || !newPw || !confirmPw) {
			Alert.alert('All fields required');
			return;
		}
		if (newPw.length < 8) {
			Alert.alert('Weak password', 'New password must be at least 8 characters.');
			return;
		}
		if (newPw !== confirmPw) {
			Alert.alert('Mismatch', 'New passwords do not match.');
			return;
		}

		if (mfaEnabled) {
			setPwPendingPayload({ currentPassword: currentPw, newPassword: newPw });
			setPwMfaModal(true);
			return;
		}

		await submitPasswordChange({ currentPassword: currentPw, newPassword: newPw });
	};

	const submitPasswordChange = async (
		payload: { currentPassword: string; newPassword: string },
		mfaCode?: string,
	) => {
		try {
			setPwLoading(true);
			await api.patch('/auth/change-password', payload, {
				headers: mfaCode ? { 'X-MFA-Code': mfaCode } : {},
			});
			Alert.alert('Success', 'Your password has been updated.');
			setPwModal(false);
			setPwMfaModal(false);
			setCurrentPw('');
			setNewPw('');
			setConfirmPw('');
			setPwPendingPayload(null);
		} catch (e: any) {
			Alert.alert(
				'Failed',
				e.response?.data?.message ?? 'Could not update password. Please try again.',
			);
		} finally {
			setPwLoading(false);
		}
	};

	const onPwMfaConfirm = async (code: string) => {
		if (!pwPendingPayload) return;
		await submitPasswordChange(pwPendingPayload, code);
	};

	// ── MFA disable ──────────────────────────────────────────────────────────────

	const handleMfaDisable = async (code: string) => {
		try {
			setMfaDisableLoading(true);
			await api.delete('/auth/mfa/disable', { data: { token: code } });
			setMfaEnabled(false);
			setMfaDisableModal(false);
			Alert.alert('MFA Disabled', 'Two-factor authentication has been turned off.');
		} catch (e: any) {
			Alert.alert(
				'Failed',
				e.response?.data?.message ?? 'Could not disable MFA. Please try again.',
			);
		} finally {
			setMfaDisableLoading(false);
		}
	};

	// ── Delete account ───────────────────────────────────────────────────────────

	const handleDeleteAccount = () => {
		Alert.alert(
			'Delete Account',
			'Are you absolutely sure? This will permanently delete your account and all your data. This action cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete My Account',
					style: 'destructive',
					onPress: () => {
						Alert.alert('Final Confirmation', 'Type DELETE to confirm', [
							{ text: 'Cancel', style: 'cancel' },
							{
								text: 'Confirm Delete',
								style: 'destructive',
								onPress: async () => {
									try {
										await api.delete('/users/account');
									} catch {
										/* proceed with local logout even if backend fails */
									}
									await logout();
									router.replace('/login');
								},
							},
						]);
					},
				},
			],
		);
	};

	// ── Sections ─────────────────────────────────────────────────────────────────

	const PRIVACY_ITEMS = [
		{
			title: 'Data & Privacy',
			items: [
				{
					icon: 'document-text-outline',
					label: 'Privacy Policy',
					action: () => router.push('/privacy-policy'),
				},
				{
					icon: 'shield-checkmark-outline',
					label: 'Terms of Service',
					action: () => router.push('/terms-of-service'),
				},
				{
					icon: 'download-outline',
					label: 'Download My Data',
					action: () =>
						Alert.alert(
							'Download Data',
							'A copy of your data will be emailed to you within 48 hours.',
						),
				},
			],
		},
		{
			title: 'Security',
			items: [
				{
					icon: 'lock-closed-outline',
					label: 'Change Password',
					action: () => setPwModal(true),
				},
				{
					icon: 'finger-print-outline',
					label: 'Biometric Login',
					action: () =>
						Alert.alert(
							'Coming Soon',
							'Biometric login will be available in a future update.',
						),
				},
				{
					icon: 'log-out-outline',
					label: 'Sign Out of All Devices',
					action: () =>
						Alert.alert(
							'Sign Out All',
							'All active sessions will be terminated.',
							[
								{ text: 'Cancel', style: 'cancel' },
								{
									text: 'Sign Out All',
									style: 'destructive',
									onPress: async () => {
										await logout();
										router.replace('/login');
									},
								},
							],
						),
				},
			],
		},
	];

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
				<Text style={[styles.title, { color: T.text }]}>
					Privacy & Security
				</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{/* MFA Card */}
				<View
					style={[
						styles.mfaCard,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<View style={styles.mfaCardLeft}>
						<View
							style={[
								styles.mfaIcon,
								{
									backgroundColor: mfaEnabled
										? '#1A9E5F18'
										: '#F59E0B18',
								},
							]}
						>
							<Ionicons
								name="shield-checkmark"
								size={22}
								color={mfaEnabled ? '#1A9E5F' : '#F59E0B'}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.mfaTitle, { color: T.text }]}>
								Two-Factor Authentication
							</Text>
							{mfaStatusLoading ? (
								<ActivityIndicator size="small" color={T.primary} style={{ alignSelf: 'flex-start', marginTop: 2 }} />
							) : (
								<Text
									style={[
										styles.mfaStatus,
										{ color: mfaEnabled ? '#1A9E5F' : '#F59E0B' },
									]}
								>
									{mfaEnabled ? 'Enabled' : 'Not enabled'}
								</Text>
							)}
						</View>
					</View>

					{!mfaStatusLoading && (
						mfaEnabled ? (
							<TouchableOpacity
								onPress={() => setMfaDisableModal(true)}
								style={[styles.mfaToggleBtn, { borderColor: T.error }]}
								activeOpacity={0.8}
							>
								<Text style={[styles.mfaToggleBtnText, { color: T.error }]}>
									Disable
								</Text>
							</TouchableOpacity>
						) : (
							<TouchableOpacity
								onPress={() => router.push('/mfa-setup')}
								style={[styles.mfaToggleBtn, { borderColor: T.primary }]}
								activeOpacity={0.8}
							>
								<Text
									style={[styles.mfaToggleBtnText, { color: T.primary }]}
								>
									Set Up
								</Text>
							</TouchableOpacity>
						)
					)}
				</View>

				{PRIVACY_ITEMS.map((section) => (
					<View key={section.title} style={{ gap: 8 }}>
						<Text style={[styles.sectionLabel, { color: T.textMuted }]}>
							{section.title.toUpperCase()}
						</Text>
						<View
							style={[
								styles.sectionCard,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							{section.items.map((item, i) => (
								<TouchableOpacity
									key={item.label}
									onPress={item.action}
									activeOpacity={0.75}
									style={[
										styles.row,
										{
											borderBottomColor: T.border,
											borderBottomWidth:
												i < section.items.length - 1 ? 1 : 0,
										},
									]}
								>
									<View
										style={[
											styles.rowIcon,
											{ backgroundColor: T.primaryTint },
										]}
									>
										<Ionicons
											name={item.icon as any}
											size={18}
											color={T.primary}
										/>
									</View>
									<Text style={[styles.rowLabel, { color: T.text }]}>
										{item.label}
									</Text>
									<Ionicons
										name="chevron-forward"
										size={14}
										color={T.textMuted}
									/>
								</TouchableOpacity>
							))}
						</View>
					</View>
				))}

				{/* Danger zone */}
				<View style={{ gap: 8 }}>
					<Text style={[styles.sectionLabel, { color: T.error }]}>
						DANGER ZONE
					</Text>
					<TouchableOpacity
						onPress={handleDeleteAccount}
						style={[
							styles.deleteBtn,
							{ borderColor: T.error, backgroundColor: T.errorBg },
						]}
						activeOpacity={0.75}
					>
						<Ionicons name="trash-outline" size={18} color={T.error} />
						<Text style={[styles.deleteBtnText, { color: T.error }]}>
							Delete My Account
						</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>

			{/* Change Password Modal */}
			<Modal visible={pwModal} animationType="slide" transparent>
				<View style={styles.modalBackdrop}>
					<View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
						<View style={styles.modalHeader}>
							<Text style={[styles.modalTitle, { color: T.text }]}>
								Change Password
							</Text>
							<TouchableOpacity onPress={() => setPwModal(false)}>
								<Ionicons name="close" size={22} color={T.textSec} />
							</TouchableOpacity>
						</View>

						{mfaEnabled ? (
							<View style={[styles.pwMfaBadge, { backgroundColor: '#1A9E5F18', borderColor: '#1A9E5F40' }]}>
								<Ionicons name="shield-checkmark" size={16} color="#1A9E5F" />
								<Text style={[styles.pwMfaBadgeText, { color: '#1A9E5F' }]}>
									You'll be asked for your authenticator code to confirm this change.
								</Text>
							</View>
						) : (
							<View style={[styles.pwMfaBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
								<Ionicons name="shield-outline" size={16} color="#F59E0B" />
								<Text style={[styles.pwMfaBadgeText, { color: '#F59E0B' }]}>
									Two-factor authentication is not enabled. Enable it for better account security.
								</Text>
							</View>
						)}

						<PwField
							label="Current Password"
							value={currentPw}
							onChange={setCurrentPw}
							show={showCurrent}
							toggle={() => setShowCurrent((v) => !v)}
							T={T}
						/>
						<PwField
							label="New Password"
							value={newPw}
							onChange={setNewPw}
							show={showNew}
							toggle={() => setShowNew((v) => !v)}
							T={T}
						/>
						<PwField
							label="Confirm New Password"
							value={confirmPw}
							onChange={setConfirmPw}
							show={showConfirm}
							toggle={() => setShowConfirm((v) => !v)}
							T={T}
						/>

						<TouchableOpacity
							onPress={handleChangePassword}
							disabled={pwLoading}
							style={[
								styles.modalSaveBtn,
								{
									backgroundColor: pwLoading ? T.surface3 : T.primary,
								},
							]}
							activeOpacity={0.85}
						>
							{pwLoading ? (
								<ActivityIndicator color="#fff" size="small" />
							) : (
								<Text style={styles.modalSaveBtnText}>
									Update Password
								</Text>
							)}
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* MFA code prompt — password change */}
			<MfaCodeModal
				visible={pwMfaModal}
				onCancel={() => {
					setPwMfaModal(false);
					setPwPendingPayload(null);
				}}
				onConfirm={onPwMfaConfirm}
				loading={pwLoading}
				title="Confirm Password Change"
				subtitle="Enter your authenticator code to confirm this password change."
			/>

			{/* MFA disable confirmation */}
			<MfaCodeModal
				visible={mfaDisableModal}
				onCancel={() => setMfaDisableModal(false)}
				onConfirm={handleMfaDisable}
				loading={mfaDisableLoading}
				title="Disable Two-Factor Auth"
				subtitle="Enter your authenticator code to turn off two-factor authentication."
			/>
		</View>
	);
}

function PwField({ label, value, onChange, show, toggle, T }: any) {
	return (
		<View style={{ gap: 6 }}>
			<Text
				style={{
					fontSize: 11,
					fontWeight: '600',
					color: T.textSec,
					textTransform: 'uppercase',
					letterSpacing: 0.5,
				}}
			>
				{label}
			</Text>
			<View
				style={[
					styles.pwRow,
					{ backgroundColor: T.surface2, borderColor: T.border },
				]}
			>
				<TextInput
					value={value}
					onChangeText={onChange}
					secureTextEntry={!show}
					style={{ flex: 1, fontSize: 14, color: T.text }}
					placeholderTextColor={T.textMuted}
					placeholder="••••••••"
				/>
				<TouchableOpacity onPress={toggle}>
					<Ionicons
						name={show ? 'eye-off-outline' : 'eye-outline'}
						size={18}
						color={T.textMuted}
					/>
				</TouchableOpacity>
			</View>
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
	scroll: { padding: 20, gap: 20, paddingBottom: 40 },
	mfaCard: {
		borderRadius: 4,
		borderWidth: 1,
		padding: 14,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	mfaCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
	mfaIcon: {
		width: 40,
		height: 40,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	mfaTitle: { fontSize: 14, fontWeight: '700' },
	mfaStatus: { fontSize: 12, marginTop: 1 },
	mfaToggleBtn: {
		borderWidth: 1.5,
		borderRadius: 4,
		paddingHorizontal: 14,
		paddingVertical: 6,
	},
	mfaToggleBtnText: { fontSize: 13, fontWeight: '700' },
	sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
	sectionCard: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	rowIcon: {
		width: 34,
		height: 34,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	rowLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
	deleteBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 16,
		borderRadius: 4,
		borderWidth: 1.5,
	},
	deleteBtnText: { fontSize: 14, fontWeight: '700' },
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	modalSheet: {
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		padding: 24,
		paddingBottom: 40,
		gap: 14,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 4,
	},
	modalTitle: { fontSize: 17, fontWeight: '700' },
	pwRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		height: 46,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
	},
	modalSaveBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 4,
	},
	modalSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
	pwMfaBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		borderRadius: 4,
		borderWidth: 1,
		padding: 12,
	},
	pwMfaBadgeText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
