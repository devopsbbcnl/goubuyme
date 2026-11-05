import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import DeleteAccountModal from '@/components/DeleteAccountModal';
import api from '@/services/api';

interface Form {
	companyName: string;
	registrationNumber: string;
	address: string;
	city: string;
	state: string;
}

const EMPTY: Form = { companyName: '', registrationNumber: '', address: '', city: '', state: '' };

export default function CompanyAccountScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { user, logout } = useAuth();
	const [form, setForm] = useState<Form>(EMPTY);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
	const [deleteModal, setDeleteModal] = useState(false);

	useFocusEffect(
		useCallback(() => {
			api
				.get('/company/me')
				.then((res) => {
					const c = res.data.data;
					setForm({
						companyName: c.companyName ?? '',
						registrationNumber: c.registrationNumber ?? '',
						address: c.address ?? '',
						city: c.city ?? '',
						state: c.state ?? '',
					});
				})
				.catch(() => setMessage({ text: 'Could not load your company details.', ok: false }))
				.finally(() => setLoading(false));
		}, []),
	);

	const set = (key: keyof Form) => (v: string) => {
		setForm((f) => ({ ...f, [key]: v }));
		setMessage(null);
	};

	const save = async () => {
		if (form.companyName.trim().length < 2 || !form.address.trim() || !form.city.trim() || !form.state.trim()) {
			setMessage({ text: 'Company name, address, city and state are required.', ok: false });
			return;
		}
		try {
			setSaving(true);
			await api.patch('/company/me', {
				companyName: form.companyName.trim(),
				registrationNumber: form.registrationNumber.trim(),
				address: form.address.trim(),
				city: form.city.trim(),
				state: form.state.trim(),
			});
			setMessage({ text: 'Saved.', ok: true });
		} catch (err) {
			const text =
				(err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
				'Could not save your changes. Please try again.';
			setMessage({ text, ok: false });
		} finally {
			setSaving(false);
		}
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={[styles.title, { color: T.text }]}>Account</Text>
			<Text style={[styles.sub, { color: T.textSec }]}>
				{user?.name} · {user?.email}
			</Text>

			{loading ? (
				<ActivityIndicator color={T.primary} style={{ marginTop: 32 }} />
			) : (
				<>
					<AppInput label="Company name" value={form.companyName} onChangeText={set('companyName')} />
					<AppInput
						label="CAC registration number (optional)"
						value={form.registrationNumber}
						onChangeText={set('registrationNumber')}
						autoCorrect={false}
					/>
					<AppInput label="Office address" value={form.address} onChangeText={set('address')} />
					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<AppInput label="City" value={form.city} onChangeText={set('city')} />
						</View>
						<View style={{ flex: 1 }}>
							<AppInput label="State" value={form.state} onChangeText={set('state')} />
						</View>
					</View>
					{!!message && (
						<Text style={[styles.message, { color: message.ok ? T.success : T.error }]}>{message.text}</Text>
					)}
					<PrimaryButton onPress={save} loading={saving}>
						Save changes
					</PrimaryButton>
				</>
			)}

			<View style={[styles.menu, { backgroundColor: T.surface, borderColor: T.border }]}>
				<TouchableOpacity style={styles.menuRow} onPress={() => router.push('/help' as never)}>
					<Ionicons name="help-circle-outline" size={20} color={T.textSec} />
					<Text style={[styles.menuText, { color: T.text }]}>Help and support</Text>
					<Ionicons name="chevron-forward" size={18} color={T.textMuted} />
				</TouchableOpacity>
				<TouchableOpacity
					style={[styles.menuRow, { borderTopColor: T.border, borderTopWidth: 1 }]}
					onPress={() => logout()}
				>
					<Ionicons name="log-out-outline" size={20} color={T.textSec} />
					<Text style={[styles.menuText, { color: T.text }]}>Sign out</Text>
				</TouchableOpacity>
			</View>

			<TouchableOpacity
				onPress={() => setDeleteModal(true)}
				style={[styles.deleteBtn, { borderColor: T.error, backgroundColor: T.errorBg }]}
			>
				<Ionicons name="trash-outline" size={16} color={T.error} />
				<Text style={[styles.deleteText, { color: T.error }]}>Delete my account</Text>
			</TouchableOpacity>

			<DeleteAccountModal visible={deleteModal} onClose={() => setDeleteModal(false)} />
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingBottom: 120 },
	title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' },
	sub: { fontSize: 13, marginTop: 4, marginBottom: 24, fontFamily: 'PlusJakartaSans_400Regular' },
	row: { flexDirection: 'row', gap: 12 },
	message: { fontSize: 13, marginBottom: 12, fontFamily: 'PlusJakartaSans_500Medium' },
	menu: { borderWidth: 1, borderRadius: 4, marginTop: 28 },
	menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
	menuText: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'PlusJakartaSans_600SemiBold' },
	deleteBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		borderWidth: 1,
		borderRadius: 4,
		paddingVertical: 14,
		marginTop: 20,
	},
	deleteText: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
});
