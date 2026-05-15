import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type RoleParam = 'customer' | 'vendor' | 'rider';

type RegisterErrors = {
	name?: string;
	email?: string;
	phone?: string;
	password?: string;
	confirmPassword?: string;
	businessName?: string;
	address?: string;
	city?: string;
	state?: string;
	vehicleType?: string;
	plateNumber?: string;
	referralCode?: string;
	terms?: string;
	general?: string;
};

const ROLE_LABELS: Record<
	RoleParam,
	{ title: string; sub: string }
> = {
	customer: {
		title: 'Create Customer Account',
		sub: 'Order food and more across Owerri',
	},
	vendor: {
		title: 'Register Your Business',
		sub: 'List your restaurant or store',
	},
	rider: { title: 'Join as a Rider', sub: 'Earn on your schedule' },
};

const CATEGORIES = [
	{ value: 'RESTAURANT', label: 'Restaurant' },
	{ value: 'GROCERY', label: 'Grocery' },
	{ value: 'PHARMACY', label: 'Pharmacy' },
	{ value: 'ERRAND', label: 'Errand' },
];

const FIELD_LABELS: Record<string, keyof RegisterErrors> = {
	name: 'name',
	email: 'email',
	phone: 'phone',
	password: 'password',
	businessName: 'businessName',
	address: 'address',
	city: 'city',
	state: 'state',
	vehicleType: 'vehicleType',
	plateNumber: 'plateNumber',
	referralCode: 'referralCode',
};

function cleanPhoneNumber(value: string) {
	return value.trim().replace(/(?!^\+)[^0-9]/g, '');
}

function validationMessage(field: string, message: string) {
	if (field === 'email') return 'Enter a valid email address.';
	if (field === 'phone')
		return 'Enter a valid phone number, e.g. +2348123456789.';
	if (field === 'password') return 'Password must be at least 8 characters.';
	if (field === 'name') return 'Enter your full name.';
	if (field === 'businessName') return 'Enter your business name.';
	if (field === 'address') return 'Enter your street address.';
	if (field === 'city') return 'Enter your city.';
	if (field === 'vehicleType') return 'Enter your vehicle type.';
	if (field === 'plateNumber') return 'Enter your vehicle licence plate number.';
	return message;
}

const PASSWORD_RULES = [
	{ key: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
	{ key: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
	{ key: 'lower', label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
	{ key: 'number', label: 'One number', test: (v: string) => /[0-9]/.test(v) },
	{ key: 'symbol', label: 'One symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

const isStrongPassword = (value: string) =>
	PASSWORD_RULES.every(rule => rule.test(value));

function getRegisterErrors(err: unknown): RegisterErrors {
	const axiosErr = err as {
		response?: {
			status?: number;
			data?: {
				message?: string;
				errors?: { field: string; message: string }[];
			};
		};
		request?: unknown;
	};
	const status = axiosErr.response?.status;
	const data = axiosErr.response?.data;

	if (data?.errors?.length) {
		return data.errors.reduce<RegisterErrors>((acc, item) => {
			const key = FIELD_LABELS[item.field];
			if (key) acc[key] = validationMessage(item.field, item.message);
			else acc.general = item.message;
			return acc;
		}, {});
	}

	if (status === 409 || data?.message === 'Email already registered.') {
		return {
			email:
				'An account already exists with this email. Try signing in instead.',
		};
	}
	if (status === 429)
		return {
			general: 'Too many sign-up attempts. Please wait a moment and try again.',
		};
	if (axiosErr.request && !axiosErr.response) {
		return {
			general: 'Cannot reach the server. Check your connection and try again.',
		};
	}

	return { general: data?.message ?? 'Registration failed. Please try again.' };
}

export default function RegisterScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const params = useLocalSearchParams<{ role?: string }>();
	const role = (params.role ?? 'customer') as RoleParam;
	const meta = ROLE_LABELS[role] ?? ROLE_LABELS.customer;

	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [referral, setReferral] = useState('');

	const [bizName, setBizName] = useState('');
	const [category, setCategory] = useState('RESTAURANT');
	const [address, setAddress] = useState('');
	const [city, setCity] = useState('');
	const [stateVal, setStateVal] = useState('');

	const [vehicle, setVehicle] = useState('');
	const [plateNumber, setPlateNumber] = useState('');
	const [termsAccepted, setTermsAccepted] = useState(false);
	const [busy, setBusy] = useState(false);
	const [errors, setErrors] = useState<RegisterErrors>({});

	const clearError = (field: keyof RegisterErrors) => {
		if (errors[field] || errors.general) {
			setErrors((prev) => ({
				...prev,
				[field]: undefined,
				general: undefined,
			}));
		}
	};

	const validateRegister = () => {
		const next: RegisterErrors = {};
		const trimmedEmail = email.trim();
		const cleanedPhone = cleanPhoneNumber(phone);

		if (!name.trim()) next.name = 'Enter your full name.';
		else if (name.trim().length < 2)
			next.name = 'Name must be at least 2 characters.';

		if (!trimmedEmail) next.email = 'Enter your email address.';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
			next.email = 'Enter a valid email address.';

		if (cleanedPhone && !/^\+?[0-9]{10,15}$/.test(cleanedPhone)) {
			next.phone = 'Enter a valid phone number, e.g. +2348123456789.';
		}

		if (!password) next.password = 'Create a password.';
		else if (!isStrongPassword(password))
			next.password = 'Use a stronger password that meets all rules.';

		if (!confirmPassword) next.confirmPassword = 'Please confirm your password.';
		else if (confirmPassword !== password)
			next.confirmPassword = 'Passwords do not match.';

		if (role === 'vendor') {
			if (!bizName.trim()) next.businessName = 'Enter your business name.';
			if (!address.trim()) next.address = 'Enter your street address.';
			if (!city.trim()) next.city = 'Enter your city.';
			if (!stateVal.trim()) next.state = 'Enter your state.';
		}

		if (role === 'rider') {
			if (!vehicle.trim()) next.vehicleType = 'Enter your vehicle type.';
		}

		if (!termsAccepted) {
			next.terms = 'You must accept the Terms of Service and Privacy Policy.';
		}

		setErrors(next);
		return Object.keys(next).length === 0;
	};

	const handleRegister = async () => {
		if (!validateRegister()) return;

		try {
			setBusy(true);
			setErrors({});

			const cleanPhone = cleanPhoneNumber(phone);
			const payload: Record<string, unknown> = {
				name: name.trim(),
				email: email.trim().toLowerCase(),
				password,
				role: role.toUpperCase(),
				...(cleanPhone ? { phone: cleanPhone } : {}),
				...(referral.trim() ? { referralCode: referral.trim() } : {}),
			};

			if (role === 'vendor') {
				payload.businessName = bizName.trim();
				payload.category = category;
				payload.address = address.trim();
				payload.city = city.trim();
				payload.state = stateVal.trim();
				payload.commissionTier = 'TIER_2';
			}

			if (role === 'rider') {
				payload.vehicleType = vehicle.trim();
				if (plateNumber.trim()) payload.plateNumber = plateNumber.trim().toUpperCase();
			}

			const res = await api.post('/auth/register', payload);
			const { userId, email: verifyEmail, role: verifyRole } = res.data.data;

			router.replace({
				pathname: '/verify-otp',
				params: { userId, email: verifyEmail, role: verifyRole.toLowerCase() },
			} as never);
		} catch (err: unknown) {
			setErrors(getRegisterErrors(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
			keyboardShouldPersistTaps="handled"
		>
			<TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
				<Ionicons name="chevron-back" size={22} color={T.text} />
			</TouchableOpacity>

			
			<Text style={[styles.title, { color: T.text }]}>{meta.title}</Text>
			<Text style={[styles.sub, { color: T.textSec }]}>{meta.sub}</Text>

			<AppInput
				label="Full Name"
				value={name}
				onChangeText={(v) => {
					setName(v);
					clearError('name');
				}}
				placeholder="Chioma Adaeze"
				error={errors.name}
			/>
			<AppInput
				label="Email Address"
				value={email}
				onChangeText={(v) => {
					setEmail(v);
					clearError('email');
				}}
				placeholder="you@example.com"
				keyboardType="email-address"
				error={errors.email}
			/>
			<AppInput
				label="Phone Number"
				value={phone}
				onChangeText={(v) => {
					setPhone(v);
					clearError('phone');
				}}
				placeholder="+234 812 345 6789"
				keyboardType="phone-pad"
				error={errors.phone}
			/>
			<AppInput
				label="Password"
				value={password}
				onChangeText={(v) => {
					setPassword(v);
					clearError('password');
				}}
				placeholder="Create a strong password"
				secureTextEntry
				error={errors.password}
			/>
			{password.length > 0 && (
				<View style={[styles.passwordHint, { backgroundColor: T.surface, borderColor: T.border }]}>
					{PASSWORD_RULES.map(rule => {
						const ok = rule.test(password);
						return (
							<View key={rule.key} style={styles.passwordRule}>
								<Ionicons
									name={ok ? 'checkmark-circle' : 'ellipse-outline'}
									size={14}
									color={ok ? T.success : T.textMuted}
								/>
								<Text style={[styles.passwordRuleText, { color: ok ? T.success : T.textSec }]}>
									{rule.label}
								</Text>
							</View>
						);
					})}
				</View>
			)}
			<AppInput
				label="Confirm Password"
				value={confirmPassword}
				onChangeText={(v) => {
					setConfirmPassword(v);
					clearError('confirmPassword');
				}}
				placeholder="Re-enter your password"
				secureTextEntry
				error={errors.confirmPassword}
			/>

			{role === 'vendor' && (
				<>
					<AppInput
						label="Business Name"
						value={bizName}
						onChangeText={(v) => {
							setBizName(v);
							clearError('businessName');
						}}
						placeholder="Mama Titi Kitchen"
						error={errors.businessName}
					/>

					<Text style={[styles.fieldLabel, { color: T.textSec }]}>
						Category
					</Text>
					<View style={styles.categoryRow}>
						{CATEGORIES.map((c) => (
							<TouchableOpacity
								key={c.value}
								onPress={() => setCategory(c.value)}
								style={[
									styles.catBtn,
									{
										backgroundColor:
											category === c.value ? T.primaryTint : T.surface,
										borderColor: category === c.value ? T.primary : T.border,
										borderWidth: category === c.value ? 1.5 : 1,
									},
								]}
							>
								<Text
									style={[
										styles.catLabel,
										{ color: category === c.value ? T.primary : T.textSec },
									]}
								>
									{c.label}
								</Text>
							</TouchableOpacity>
						))}
					</View>

					<AppInput
						label="Street Address"
						value={address}
						onChangeText={(v) => {
							setAddress(v);
							clearError('address');
						}}
						placeholder="12 Wetheral Road"
						error={errors.address}
					/>
					<View style={styles.rowFields}>
						<View style={{ flex: 1 }}>
							<AppInput
								label="City"
								value={city}
								onChangeText={(v) => {
									setCity(v);
									clearError('city');
								}}
								placeholder="Owerri"
								error={errors.city}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<AppInput
								label="State"
								value={stateVal}
								onChangeText={(v) => {
									setStateVal(v);
									clearError('state');
								}}
								placeholder="Imo"
								error={errors.state}
							/>
						</View>
					</View>
				</>
			)}

			{role === 'rider' && (
				<>
					<AppInput
						label="Vehicle Type"
						value={vehicle}
						onChangeText={(v) => {
							setVehicle(v);
							clearError('vehicleType');
						}}
						placeholder="e.g. Honda CB150, Tricycle"
						error={errors.vehicleType}
					/>
					<AppInput
						label="Licence Plate Number (optional)"
						value={plateNumber}
						onChangeText={(v) => {
							setPlateNumber(v.toUpperCase());
							clearError('plateNumber');
						}}
						placeholder="e.g. ABC 123 DE"
						autoCorrect={false}
						error={errors.plateNumber}
					/>
				</>
			)}

			<AppInput
				label="Referral Code (optional)"
				value={referral}
				onChangeText={(v) => {
					setReferral(v);
					clearError('referralCode');
				}}
				placeholder="GBM-XXXXX"
				error={errors.referralCode}
			/>

			<TouchableOpacity
				activeOpacity={0.7}
				onPress={() => {
					setTermsAccepted((v) => !v);
					if (errors.terms)
						setErrors((prev) => ({ ...prev, terms: undefined }));
				}}
				style={styles.termsRow}
			>
				<View
					style={[
						styles.checkbox,
						{
							backgroundColor: termsAccepted ? T.primary : 'transparent',
							borderColor: errors.terms ? '#E53E3E' : termsAccepted ? T.primary : T.border,
						},
					]}
				>
					{termsAccepted && (
						<Ionicons name="checkmark" size={13} color="#fff" />
					)}
				</View>
				<Text style={[styles.termsText, { color: T.textSec }]}>
					I agree to the{' '}
					<Text
						style={{ color: T.primary, fontWeight: '700' }}
						onPress={() => router.push('/(customer)/terms-of-service' as never)}
					>
						Terms of Service
					</Text>
					{' '}and{' '}
					<Text
						style={{ color: T.primary, fontWeight: '700' }}
						onPress={() => router.push('/(customer)/privacy-policy' as never)}
					>
						Privacy Policy
					</Text>
				</Text>
			</TouchableOpacity>
			{!!errors.terms && (
				<Text style={[styles.errorText, { color: '#E53E3E', marginTop: -4 }]}>
					{errors.terms}
				</Text>
			)}

			{!!errors.general && (
				<Text style={[styles.errorText, { color: '#E53E3E' }]}>
					{errors.general}
				</Text>
			)}

			<PrimaryButton onPress={handleRegister} loading={busy}>
				Create Account
			</PrimaryButton>

			<TouchableOpacity
				onPress={() => router.push('/login')}
				style={styles.loginLink}
			>
				<Text style={{ fontSize: 14, color: T.textSec }}>
					Already have an account?{' '}
					<Text style={{ color: T.primary, fontWeight: '700' }}>Sign In</Text>
				</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { padding: 24, paddingTop: 16, paddingBottom: 40 },
	backBtn: { marginBottom: 16, alignSelf: 'flex-start' },
	icon: {
		fontSize: 28,
		marginBottom: 12,
		fontWeight: '800',
		fontFamily: 'PlusJakartaSans_800ExtraBold',
	},
	title: {
		fontSize: 26,
		fontWeight: '800',
		letterSpacing: -0.5,
		fontFamily: 'PlusJakartaSans_800ExtraBold',
	},
	sub: {
		fontSize: 13,
		marginTop: 4,
		marginBottom: 28,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
	fieldLabel: {
		fontSize: 11,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 8,
		fontFamily: 'PlusJakartaSans_700Bold',
	},
	categoryRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginBottom: 16,
	},
	rowFields: { flexDirection: 'row', gap: 12 },
	catBtn: { borderRadius: 4, paddingVertical: 9, paddingHorizontal: 14 },
	catLabel: {
		fontSize: 12,
		fontWeight: '600',
		fontFamily: 'PlusJakartaSans_600SemiBold',
	},
	errorText: {
		fontSize: 13,
		marginBottom: 12,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
	passwordHint: {
		borderRadius: 4,
		borderWidth: 1,
		padding: 12,
		gap: 7,
		marginTop: -8,
		marginBottom: 16,
	},
	passwordRule: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	passwordRuleText: {
		fontSize: 12,
		fontFamily: 'PlusJakartaSans_500Medium',
	},
	loginLink: { alignItems: 'center', marginTop: 24 },
	termsRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
		marginTop: 4,
		marginBottom: 16,
	},
	checkbox: {
		width: 20,
		height: 20,
		borderRadius: 4,
		borderWidth: 1.5,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 1,
		flexShrink: 0,
	},
	termsText: {
		fontSize: 13,
		flex: 1,
		lineHeight: 20,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
});
