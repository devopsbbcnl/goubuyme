import React, { useEffect, useRef, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TextInput,
	TouchableOpacity,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

type Step = 'phone' | 'code';

const errorMessage = (err: unknown, fallback: string) =>
	(err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** "+2348031234567" → "8031234567" for the local-number input. */
const localDigits = (phone: string | null | undefined) => {
	let d = (phone ?? '').replace(/\D/g, '');
	if (d.startsWith('234')) d = d.slice(3);
	if (d.startsWith('0')) d = d.slice(1);
	return d;
};

/** SMS verification of the signed-in user's phone number (Termii). */
export default function VerifyPhoneScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();

	const [step, setStep] = useState<Step>('phone');
	const [phone, setPhone] = useState('');
	const [sentTo, setSentTo] = useState('');
	const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [countdown, setCountdown] = useState(0);
	const inputs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

	useEffect(() => {
		api.get('/auth/me')
			.then((res) => setPhone(localDigits(res.data?.data?.phone)))
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (countdown <= 0) return;
		const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
		return () => clearTimeout(t);
	}, [countdown]);

	const sendCode = async () => {
		const local = localDigits(phone);
		if (!/^[789]\d{9}$/.test(local)) {
			setError('Enter a valid Nigerian mobile number, e.g. 8031234567.');
			return;
		}
		try {
			setBusy(true);
			setError('');
			const res = await api.post('/auth/phone/send-otp', { phone: `+234${local}` });
			setSentTo(res.data?.data?.phone ?? `+234${local}`);
			setDigits(Array(OTP_LENGTH).fill(''));
			setStep('code');
			setCountdown(RESEND_COOLDOWN);
			setTimeout(() => inputs.current[0]?.focus(), 100);
		} catch (err) {
			setError(errorMessage(err, 'Could not send the code. Please try again.'));
		} finally {
			setBusy(false);
		}
	};

	const handleChange = (text: string, index: number) => {
		setError('');
		const cleaned = text.replace(/\D/g, '');
		if (cleaned.length > 1) {
			const next = [...digits];
			cleaned.slice(0, OTP_LENGTH).split('').forEach((d, i) => {
				if (index + i < OTP_LENGTH) next[index + i] = d;
			});
			setDigits(next);
			inputs.current[Math.min(index + cleaned.length, OTP_LENGTH - 1)]?.focus();
			return;
		}
		const next = [...digits];
		next[index] = cleaned;
		setDigits(next);
		if (cleaned && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
	};

	const handleKeyPress = (key: string, index: number) => {
		if (key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
	};

	const verify = async () => {
		const code = digits.join('');
		if (code.length < OTP_LENGTH) {
			setError('Enter all 6 digits.');
			return;
		}
		try {
			setBusy(true);
			setError('');
			await api.post('/auth/phone/verify', { code });
			Alert.alert('Phone verified', 'Your phone number has been verified.', [
				{ text: 'OK', onPress: () => router.back() },
			]);
		} catch (err) {
			setError(errorMessage(err, 'Verification failed. Please try again.'));
		} finally {
			setBusy(false);
		}
	};

	const maskedTo = sentTo ? sentTo.replace(/^(\+234)(\d{3})\d{4}(\d{3})$/, '$1 $2 **** $3') : '';

	return (
		<KeyboardAvoidingView
			style={{ flex: 1, backgroundColor: T.bg }}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<ScrollView
				contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
				keyboardShouldPersistTaps="handled"
			>
				<TouchableOpacity
					onPress={() => (step === 'code' ? setStep('phone') : router.back())}
					style={styles.backBtn}
				>
					<Ionicons name="chevron-back" size={22} color={T.text} />
				</TouchableOpacity>

				<View style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}>
					<Ionicons name="phone-portrait-outline" size={28} color={T.primary} />
				</View>

				{step === 'phone' ? (
					<>
						<Text style={[styles.title, { color: T.text }]}>Verify your phone</Text>
						<Text style={[styles.sub, { color: T.textSec }]}>
							We'll text a 6-digit code to this number. Standard SMS rates may apply.
						</Text>

						<View style={[styles.phoneRow, { borderColor: error ? '#E53E3E' : T.border, backgroundColor: T.surface }]}>
							<Text style={[styles.prefix, { color: T.text, borderRightColor: T.border }]}>+234</Text>
							<TextInput
								value={phone}
								onChangeText={(v) => { setError(''); setPhone(v.replace(/\D/g, '').slice(0, 11)); }}
								placeholder="8031234567"
								placeholderTextColor={T.textMuted}
								keyboardType="phone-pad"
								style={[styles.phoneInput, { color: T.text }]}
								autoFocus
							/>
						</View>

						{!!error && <Text style={styles.errorText}>{error}</Text>}

						<View style={styles.btn}>
							<PrimaryButton onPress={sendCode} loading={busy}>Send code</PrimaryButton>
						</View>
					</>
				) : (
					<>
						<Text style={[styles.title, { color: T.text }]}>Enter the code</Text>
						<Text style={[styles.sub, { color: T.textSec }]}>
							We sent a 6-digit code by SMS to{'\n'}
							<Text style={{ color: T.text, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{maskedTo}</Text>
						</Text>

						<View style={styles.otpRow}>
							{digits.map((d, i) => (
								<TextInput
									key={i}
									ref={(el) => { inputs.current[i] = el; }}
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
									onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
									keyboardType="number-pad"
									textContentType="oneTimeCode"
									autoComplete="sms-otp"
									maxLength={6}
									selectTextOnFocus
									textAlign="center"
								/>
							))}
						</View>

						{!!error && <Text style={styles.errorText}>{error}</Text>}

						<View style={styles.btn}>
							<PrimaryButton onPress={verify} loading={busy}>Verify phone</PrimaryButton>
						</View>

						<View style={styles.resendRow}>
							<Text style={{ fontSize: 14, color: T.textSec, fontFamily: 'PlusJakartaSans_400Regular' }}>
								Didn't receive the code?{' '}
							</Text>
							{countdown > 0 ? (
								<Text style={{ fontSize: 14, color: T.textMuted, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
									Resend in {countdown}s
								</Text>
							) : (
								<TouchableOpacity onPress={sendCode} disabled={busy}>
									<Text style={{ fontSize: 14, color: T.primary, fontFamily: 'PlusJakartaSans_700Bold' }}>Resend</Text>
								</TouchableOpacity>
							)}
						</View>
					</>
				)}
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: { padding: 24, paddingBottom: 40, flexGrow: 1 },
	backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
	iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
	title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 8 },
	sub: { fontSize: 14, lineHeight: 22, marginBottom: 28, fontFamily: 'PlusJakartaSans_400Regular' },
	phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 4, marginBottom: 12 },
	prefix: { paddingHorizontal: 14, paddingVertical: 14, borderRightWidth: 1, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' },
	phoneInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' },
	otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 12 },
	otpBox: { width: 48, height: 56, borderRadius: 4, fontSize: 22, fontFamily: 'PlusJakartaSans_700Bold' },
	errorText: { color: '#E53E3E', fontSize: 13, textAlign: 'center', marginBottom: 12, fontFamily: 'PlusJakartaSans_400Regular' },
	btn: { marginTop: 12 },
	resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, alignItems: 'center' },
});
