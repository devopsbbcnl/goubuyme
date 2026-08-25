import React, { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CenteredKeyboardModal } from '@/components/ui/CenteredKeyboardModal';
import api from '@/services/api';
import MfaCodeModal from '@/components/MfaCodeModal';

interface Props {
	visible: boolean;
	onClose: () => void;
}

export default function DeleteAccountModal({ visible, onClose }: Props) {
	const { theme: T } = useTheme();
	const { logout } = useAuth();

	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [mfaModal, setMfaModal] = useState(false);

	const handleClose = () => {
		if (loading) return;
		setPassword('');
		setMfaModal(false);
		onClose();
	};

	const handleSubmit = async () => {
		if (!password) {
			Alert.alert('Password required', 'Enter your password to confirm account deletion.');
			return;
		}

		let mfaEnabled = false;
		try {
			const res = await api.get('/auth/mfa/status');
			mfaEnabled = res.data.data.mfaEnabled;
		} catch {
			// non-critical — if the status check fails, submit without an MFA code
			// and let the backend enforce it (requireMfa is a no-op when disabled).
		}

		if (mfaEnabled) {
			setMfaModal(true);
			return;
		}

		await performDelete();
	};

	const performDelete = async (mfaCode?: string) => {
		try {
			setLoading(true);
			await api.delete('/auth/me', {
				data: { password },
				headers: mfaCode ? { 'X-MFA-Code': mfaCode } : {},
			});
			setMfaModal(false);
			setPassword('');
			await logout();
			router.replace('/onboarding');
		} catch (e: any) {
			Alert.alert(
				'Failed',
				e.response?.data?.message ?? 'Could not delete account. Please try again.',
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<CenteredKeyboardModal visible={visible} onRequestClose={handleClose} cardStyle={{ backgroundColor: T.surface }}>
						<View style={styles.sheet}>
							<View style={styles.header}>
								<View style={[styles.iconWrap, { backgroundColor: T.errorBg }]}>
									<Ionicons name="trash-outline" size={22} color={T.error} />
								</View>
								<TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
									<Ionicons name="close" size={22} color={T.textSec} />
								</TouchableOpacity>
							</View>

							<Text style={[styles.title, { color: T.error }]}>Delete Account</Text>
							<Text style={[styles.subtitle, { color: T.textSec }]}>
								This will deactivate your account and remove your access immediately. Enter your
								password to confirm. This cannot be undone from the app — contact support to
								restore your account.
							</Text>

							<View style={[styles.pwRow, { backgroundColor: T.surface2, borderColor: T.border }]}>
								<TextInput
									value={password}
									onChangeText={setPassword}
									secureTextEntry={!showPassword}
									placeholder="Password"
									placeholderTextColor={T.textMuted}
									style={{ flex: 1, fontSize: 14, color: T.text }}
									autoCapitalize="none"
								/>
								<TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
									<Ionicons
										name={showPassword ? 'eye-off-outline' : 'eye-outline'}
										size={18}
										color={T.textMuted}
									/>
								</TouchableOpacity>
							</View>

							<TouchableOpacity
								onPress={handleSubmit}
								disabled={loading}
								style={[styles.deleteBtn, { backgroundColor: loading ? T.surface3 : T.error }]}
								activeOpacity={0.85}
							>
								{loading ? (
									<ActivityIndicator color="#fff" size="small" />
								) : (
									<Text style={styles.deleteBtnText}>Delete My Account</Text>
								)}
							</TouchableOpacity>
						</View>
			</CenteredKeyboardModal>

			<MfaCodeModal
				visible={mfaModal}
				onCancel={() => setMfaModal(false)}
				onConfirm={(code) => performDelete(code)}
				loading={loading}
				title="Confirm Account Deletion"
				subtitle="Enter your authenticator code to permanently confirm deleting your account."
			/>
		</>
	);
}

const styles = StyleSheet.create({
	sheet: {
		padding: 24,
		gap: 14,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	iconWrap: {
		width: 44,
		height: 44,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 18, fontWeight: '700' },
	subtitle: { fontSize: 14, lineHeight: 20 },
	pwRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		height: 46,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
	},
	deleteBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	deleteBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
