import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	Image,
	TextInput,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	ActivityIndicator,
	Alert,
	Clipboard,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/services/api';

export default function MfaSetupScreen() {
	const { theme: T } = useTheme();
	const { from } = useLocalSearchParams<{ from?: string }>();
	const goBack = () => (from ? router.navigate(from as any) : router.back());
	const [loading, setLoading] = useState(true);
	const [qrCode, setQrCode] = useState('');
	const [manualKey, setManualKey] = useState('');
	const [verifyCode, setVerifyCode] = useState('');
	const [verifying, setVerifying] = useState(false);

	useEffect(() => {
		(async () => {
			try {
				const res = await api.post('/auth/mfa/setup');
				setQrCode(res.data.data.qrCode);
				setManualKey(res.data.data.manualKey);
			} catch (e: any) {
				Alert.alert(
					'Setup Error',
					e.response?.data?.message ?? 'Could not initiate MFA setup.',
					[{ text: 'OK', onPress: goBack }],
				);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const handleVerify = async () => {
		if (verifyCode.length !== 6) return;
		try {
			setVerifying(true);
			await api.post('/auth/mfa/verify-setup', { token: verifyCode });
			Alert.alert(
				'MFA Enabled',
				'Your account is now protected with two-factor authentication.',
				[{ text: 'Done', onPress: goBack }],
			);
		} catch (e: any) {
			Alert.alert(
				'Verification Failed',
				e.response?.data?.message ?? 'Invalid code. Please try again.',
			);
			setVerifyCode('');
		} finally {
			setVerifying(false);
		}
	};

	const copyKey = () => {
		Clipboard.setString(manualKey);
		Alert.alert('Copied', 'Secret key copied to clipboard.');
	};

	if (loading) {
		return (
			<View
				style={{
					flex: 1,
					backgroundColor: '#fff',
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
			<View
				style={[styles.header, { borderBottomColor: T.border, paddingTop: 16 }]}
			>
				<TouchableOpacity
					onPress={goBack}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: T.text }]}>
					Set Up Authenticator
				</Text>
				<View style={{ width: 38 }} />
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				{/* Step 1 */}
				<View
					style={[
						styles.step,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<Text style={[styles.stepNum, { color: T.primary }]}>Step 1</Text>
					<Text style={[styles.stepTitle, { color: T.text }]}>
						Scan this QR code
					</Text>
					<Text style={[styles.stepSub, { color: T.textSec }]}>
						Open your authenticator app (Google Authenticator, Authy, Microsoft
						Authenticator) and scan the code below.
					</Text>
					{qrCode ? (
						<Image
							source={{ uri: qrCode }}
							style={styles.qrImage}
							resizeMode="contain"
						/>
					) : null}
				</View>

				{/* Step 2 */}
				<View
					style={[
						styles.step,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<Text style={[styles.stepNum, { color: T.primary }]}>Step 2</Text>
					<Text style={[styles.stepTitle, { color: T.text }]}>
						Or enter key manually
					</Text>
					<Text style={[styles.stepSub, { color: T.textSec }]}>
						Can't scan? Select "Enter setup key" in your app and paste this key.
					</Text>
					<TouchableOpacity
						onPress={copyKey}
						style={[
							styles.keyBox,
							{ backgroundColor: T.surface2, borderColor: T.border },
						]}
						activeOpacity={0.8}
					>
						<Text
							style={[styles.keyText, { color: T.text }]}
							numberOfLines={1}
						>
							{manualKey}
						</Text>
						<Ionicons name="copy-outline" size={16} color={T.textMuted} />
					</TouchableOpacity>
				</View>

				{/* Step 3 */}
				<View
					style={[
						styles.step,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<Text style={[styles.stepNum, { color: T.primary }]}>Step 3</Text>
					<Text style={[styles.stepTitle, { color: T.text }]}>
						Enter the 6-digit code
					</Text>
					<Text style={[styles.stepSub, { color: T.textSec }]}>
						Enter the code shown in your authenticator app to confirm setup.
					</Text>
					<TextInput
						value={verifyCode}
						onChangeText={(v) =>
							setVerifyCode(v.replace(/\D/g, '').slice(0, 6))
						}
						keyboardType="number-pad"
						maxLength={6}
						placeholder="000000"
						placeholderTextColor={T.textMuted}
						style={[
							styles.codeInput,
							{
								backgroundColor: T.surface2,
								borderColor:
									verifyCode.length === 6 ? T.primary : T.border,
								color: T.text,
							},
						]}
						textAlign="center"
					/>
				</View>

				<TouchableOpacity
					onPress={handleVerify}
					disabled={verifyCode.length < 6 || verifying}
					style={[
						styles.enableBtn,
						{
							backgroundColor:
								verifyCode.length < 6 ? T.surface3 : T.primary,
						},
					]}
					activeOpacity={0.85}
				>
					{verifying ? (
						<ActivityIndicator color="#fff" size="small" />
					) : (
						<Text style={styles.enableBtnText}>Enable Two-Factor Auth</Text>
					)}
				</TouchableOpacity>

				<Text style={[styles.disclaimer, { color: T.textMuted }]}>
					Store your secret key in a safe place. You'll need it to regain
					access if you lose your authenticator app.
				</Text>
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
		paddingBottom: 16,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	headerTitle: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	step: { borderRadius: 4, borderWidth: 1, padding: 16, gap: 10 },
	stepNum: {
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 0.5,
		textTransform: 'uppercase',
	},
	stepTitle: { fontSize: 15, fontWeight: '700' },
	stepSub: { fontSize: 13, lineHeight: 19 },
	qrImage: { width: 200, height: 200, alignSelf: 'center', marginVertical: 8 },
	keyBox: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderRadius: 4,
		borderWidth: 1,
		padding: 12,
		gap: 8,
	},
	keyText: {
		flex: 1,
		fontSize: 13,
		fontWeight: '600',
		letterSpacing: 1.5,
		fontFamily: 'monospace',
	},
	codeInput: {
		height: 56,
		borderRadius: 4,
		borderWidth: 1.5,
		fontSize: 28,
		fontWeight: '700',
		letterSpacing: 12,
	},
	enableBtn: {
		height: 52,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	enableBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
	disclaimer: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
