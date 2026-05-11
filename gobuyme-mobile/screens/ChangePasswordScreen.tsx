import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	TextInput,
	Alert,
	ActivityIndicator,
	ScrollView,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';
import MfaCodeModal from '@/components/MfaCodeModal';

export default function ChangePasswordScreen() {
	const { theme: T } = useTheme();
	const { from } = useLocalSearchParams<{ from?: string }>();
	const goBack = () => (from ? router.navigate(from as any) : router.back());

	const [currentPw, setCurrentPw] = useState('');
	const [newPw, setNewPw] = useState('');
	const [confirmPw, setConfirmPw] = useState('');
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [loading, setLoading] = useState(false);

	const [mfaEnabled, setMfaEnabled] = useState(false);
	const [mfaModal, setMfaModal] = useState(false);
	const [mfaLoading, setMfaLoading] = useState(false);

	const fetchMfaStatus = useCallback(async () => {
		try {
			const res = await api.get('/auth/mfa/status');
			setMfaEnabled(res.data.data.mfaEnabled);
		} catch {
			// non-critical
		}
	}, []);

	useEffect(() => {
		fetchMfaStatus();
	}, [fetchMfaStatus]);

	const validate = () => {
		if (!currentPw || !newPw || !confirmPw) {
			Alert.alert('All fields required');
			return false;
		}
		if (newPw.length < 8) {
			Alert.alert('Weak password', 'New password must be at least 8 characters.');
			return false;
		}
		if (newPw !== confirmPw) {
			Alert.alert('Mismatch', 'New passwords do not match.');
			return false;
		}
		return true;
	};

	const handleSubmit = () => {
		if (!validate()) return;
		if (mfaEnabled) {
			setMfaModal(true);
		} else {
			submitChange();
		}
	};

	const submitChange = async (mfaCode?: string) => {
		try {
			mfaCode ? setMfaLoading(true) : setLoading(true);
			await api.patch(
				'/auth/change-password',
				{ currentPassword: currentPw, newPassword: newPw },
				{ headers: mfaCode ? { 'X-MFA-Code': mfaCode } : {} },
			);
			Alert.alert('Success', 'Your password has been updated.', [
				{ text: 'OK', onPress: goBack },
			]);
		} catch (e: any) {
			Alert.alert(
				'Failed',
				e.response?.data?.message ?? 'Could not update password. Please try again.',
			);
		} finally {
			setLoading(false);
			setMfaLoading(false);
			setMfaModal(false);
		}
	};

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<View style={[styles.header, { borderBottomColor: T.border, paddingTop: 16 }]}>
				<TouchableOpacity
					onPress={goBack}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Change Password</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
			>
				{mfaEnabled ? (
					<View style={[styles.mfaBadge, { backgroundColor: '#1A9E5F18', borderColor: '#1A9E5F40' }]}>
						<Ionicons name="shield-checkmark" size={16} color="#1A9E5F" />
						<Text style={[styles.mfaBadgeText, { color: '#1A9E5F' }]}>
							You'll be asked for your authenticator code to confirm this change.
						</Text>
					</View>
				) : (
					<View style={[styles.mfaBadge, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
						<Ionicons name="shield-outline" size={16} color="#F59E0B" />
						<Text style={[styles.mfaBadgeText, { color: '#F59E0B' }]}>
							Two-factor authentication is not enabled. Go to Privacy &amp; Security to set it up.
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
					onPress={handleSubmit}
					disabled={loading}
					style={[
						styles.saveBtn,
						{ backgroundColor: loading ? T.surface3 : T.primary },
					]}
					activeOpacity={0.85}
				>
					{loading ? (
						<ActivityIndicator color="#fff" size="small" />
					) : (
						<Text style={styles.saveBtnText}>Update Password</Text>
					)}
				</TouchableOpacity>
			</ScrollView>

			<MfaCodeModal
				visible={mfaModal}
				onCancel={() => setMfaModal(false)}
				onConfirm={submitChange}
				loading={mfaLoading}
				title="Confirm Password Change"
				subtitle="Enter your authenticator code to confirm this password change."
			/>
		</View>
	);
}

function PwField({ label, value, onChange, show, toggle, T }: any) {
	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: T.textSec }]}>{label}</Text>
			<View style={[styles.fieldRow, { backgroundColor: T.surface2, borderColor: T.border }]}>
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
	backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 18, paddingBottom: 40 },
	mfaBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		borderRadius: 4,
		borderWidth: 1,
		padding: 12,
	},
	mfaBadgeText: { flex: 1, fontSize: 13, lineHeight: 18 },
	fieldLabel: {
		fontSize: 11,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	fieldRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		height: 46,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
	},
	saveBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 4,
	},
	saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
