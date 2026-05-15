import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyOTPScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const params = useLocalSearchParams<{
		userId?: string;
		email?: string;
		role?: string;
	}>();
	const { userId, email, role } = params;

	const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
	const [resending, setResending] = useState(false);

	const inputs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

	useEffect(() => {
		if (countdown <= 0) return;
		const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
		return () => clearTimeout(t);
	}, [countdown]);

	const handleChange = (text: string, index: number) => {
		setError('');
		const cleaned = text.replace(/\D/g, '');
		if (cleaned.length > 1) {
			const filled = cleaned.slice(0, OTP_LENGTH).split('');
			const next = [...digits];
			filled.forEach((d, i) => {
				if (index + i < OTP_LENGTH) next[index + i] = d;
			});
			setDigits(next);
			const focusAt = Math.min(index + filled.length, OTP_LENGTH - 1);
			inputs.current[focusAt]?.focus();
			return;
		}
		const next = [...digits];
		next[index] = cleaned;
		setDigits(next);
		if (cleaned && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
	};

	const handleKeyPress = (key: string, index: number) => {
		if (key === 'Backspace' && !digits[index] && index > 0) {
			inputs.current[index - 1]?.focus();
		}
	};

	const handleVerify = useCallback(async () => {
		const otp = digits.join('');
		if (otp.length < OTP_LENGTH) {
			setError('Enter all 6 digits.');
			return;
		}
		try {
			setBusy(true);
			setError('');
			await api.post('/auth/verify-otp', { userId, otp });
			await AsyncStorage.removeItem('pendingOtp');
			router.replace({
				pathname: '/register-success',
				params: { role },
			} as never);
		} catch (err: unknown) {
			const axiosErr = err as { response?: { data?: { message?: string } } };
			setError(
				axiosErr.response?.data?.message ??
					'Verification failed. Please try again.',
			);
		} finally {
			setBusy(false);
		}
	}, [digits, userId, role]);

	const handleResend = async () => {
		try {
			setResending(true);
			setError('');
			await api.post('/auth/resend-otp', { userId });
			setDigits(Array(OTP_LENGTH).fill(''));
			setCountdown(RESEND_COOLDOWN);
			inputs.current[0]?.focus();
		} catch (err: unknown) {
			const axiosErr = err as { response?: { data?: { message?: string } } };
			setError(
				axiosErr.response?.data?.message ?? 'Could not resend code. Try again.',
			);
		} finally {
			setResending(false);
		}
	};

	const maskedEmail = email
		? email.replace(
				/^(.{2})(.*)(@.*)$/,
				(_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c,
			)
		: '';

	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: T.bg }}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<ScrollView
				contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
				keyboardShouldPersistTaps="handled"
			>
				<TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="chevron-back" size={22} color={T.text} />
				</TouchableOpacity>

				<View style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}>
					<Ionicons name="mail-outline" size={28} color={T.primary} />
				</View>

				<Text style={[styles.title, { color: T.text }]}>Check your email</Text>
				<Text style={[styles.sub, { color: T.textSec }]}>
					We sent a 6-digit code to{'\n'}
					<Text
						style={{ color: T.text, fontFamily: 'PlusJakartaSans_600SemiBold' }}
					>
						{maskedEmail}
					</Text>
				</Text>

				<View style={styles.otpRow}>
					{digits.map((d, i) => (
						<TextInput
							key={i}
							ref={(el) => {
								inputs.current[i] = el;
							}}
							style={[
								styles.otpBox,
								{
									borderColor: d ? T.primary : error ? '#E53E3E' : T.border,
									backgroundColor: T.surface,
									color: T.text,
									borderWidth: d ? 2 : 1,
								},
							]}
							value={d}
							onChangeText={(text) => handleChange(text, i)}
							onKeyPress={({ nativeEvent }) =>
								handleKeyPress(nativeEvent.key, i)
							}
							keyboardType="number-pad"
							maxLength={6}
							selectTextOnFocus
							textAlign="center"
							autoFocus={i === 0}
						/>
					))}
				</View>

				{!!error && (
					<Text style={[styles.errorText, { color: '#E53E3E' }]}>{error}</Text>
				)}

				<View style={styles.btn}>
					<PrimaryButton onPress={handleVerify} loading={busy}>
						Verify Email
					</PrimaryButton>
				</View>

				<View style={styles.resendRow}>
					<Text
						style={{
							fontSize: 14,
							color: T.textSec,
							fontFamily: 'PlusJakartaSans_400Regular',
						}}
					>
						Didn't receive the code?{' '}
					</Text>
					{countdown > 0 ? (
						<Text
							style={{
								fontSize: 14,
								color: T.textMuted,
								fontFamily: 'PlusJakartaSans_600SemiBold',
							}}
						>
							Resend in {countdown}s
						</Text>
					) : (
						<TouchableOpacity onPress={handleResend} disabled={resending}>
							<Text
								style={{
									fontSize: 14,
									color: T.primary,
									fontFamily: 'PlusJakartaSans_700Bold',
								}}
							>
								{resending ? 'Sending…' : 'Resend'}
							</Text>
						</TouchableOpacity>
					)}
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: { padding: 24, paddingTop: 16, paddingBottom: 40, flexGrow: 1 },
	backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
	iconWrap: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 20,
	},
	title: {
		fontSize: 26,
		fontWeight: '800',
		letterSpacing: -0.5,
		fontFamily: 'PlusJakartaSans_800ExtraBold',
		marginBottom: 8,
	},
	sub: {
		fontSize: 14,
		lineHeight: 22,
		marginBottom: 36,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
	otpRow: {
		flexDirection: 'row',
		gap: 10,
		justifyContent: 'center',
		marginBottom: 12,
	},
	otpBox: {
		width: 48,
		height: 56,
		borderRadius: 4,
		fontSize: 22,
		fontFamily: 'PlusJakartaSans_700Bold',
	},
	errorText: {
		fontSize: 13,
		textAlign: 'center',
		marginBottom: 16,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
	btn: { marginTop: 12 },
	resendRow: {
		flexDirection: 'row',
		justifyContent: 'center',
		marginTop: 24,
		alignItems: 'center',
	},
});
