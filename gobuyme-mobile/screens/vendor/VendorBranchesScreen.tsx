import React, { useCallback, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator,
	Alert,
	Switch,
	Clipboard,
	Share,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { CenteredKeyboardModal } from '@/components/ui/CenteredKeyboardModal';
import { forwardGeocode } from '@/services/geocoding';
import { setActiveVendorId } from '@/services/vendorLocation';
import api from '@/services/api';

interface Manager {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	isActive: boolean;
	hasDevice: boolean;
}

interface Location {
	id: string;
	businessName: string;
	branchLabel: string | null;
	address: string;
	city: string;
	state: string;
	contactPhone: string | null;
	approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
	isOpen: boolean;
	rating: number;
	notifyOwnerOfOrders: boolean;
	manager: Manager | null;
	_count: { menuItems: number };
}

interface Draft {
	name: string;
	address: string;
	city: string;
	state: string;
	phone: string;
}

interface LoginDraft {
	name: string;
	email: string;
	phone: string;
	password: string;
}

const EMPTY_DRAFT: Draft = { name: '', address: '', city: '', state: '', phone: '' };
const EMPTY_LOGIN: LoginDraft = { name: '', email: '', phone: '', password: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toApiPhone = (v: string) => {
	let digits = v.replace(/\D/g, '');
	if (!digits) return '';
	while (digits.startsWith('234') && digits.length > 10) digits = digits.slice(3);
	if (digits.startsWith('0')) digits = digits.slice(1);
	return `+234${digits}`;
};

const apiMessage = (err: unknown, fallback: string) =>
	(err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export default function VendorBranchesScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [main, setMain] = useState<Location | null>(null);
	const [branches, setBranches] = useState<Location[]>([]);
	const [max, setMax] = useState(10);
	const [loading, setLoading] = useState(true);

	const [editing, setEditing] = useState<Location | 'new' | null>(null);
	const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
	const [copyMenu, setCopyMenu] = useState(false);
	const [withLogin, setWithLogin] = useState(false);
	const [loginDraft, setLoginDraft] = useState<LoginDraft>(EMPTY_LOGIN);
	const [errors, setErrors] = useState<Partial<Record<keyof Draft | 'general' | 'loginName' | 'loginEmail' | 'loginPhone' | 'loginPassword', string>>>({});
	const [saving, setSaving] = useState(false);

	// Create-login dialog for an existing branch.
	const [loginFor, setLoginFor] = useState<Location | null>(null);
	// Credentials to hand over. Shown once; the server never returns the password again.
	const [handover, setHandover] = useState<{ branch: string; email: string; password: string | null } | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await api.get('/vendors/me/branches');
			setMain(res.data.data.main);
			setBranches(res.data.data.branches);
			setMax(res.data.data.max);
		} catch {
			Alert.alert('Could not load locations', 'Check your connection and try again.');
		} finally {
			setLoading(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			load();
		}, [load]),
	);

	const openNew = () => {
		setDraft({ ...EMPTY_DRAFT, city: main?.city ?? '', state: main?.state ?? '' });
		setCopyMenu(false);
		setWithLogin(false);
		setLoginDraft(EMPTY_LOGIN);
		setErrors({});
		setEditing('new');
	};

	const openEdit = (b: Location) => {
		setDraft({
			name: b.branchLabel ?? '',
			address: b.address,
			city: b.city,
			state: b.state,
			phone: (b.contactPhone ?? '').replace(/^\+234/, ''),
		});
		setErrors({});
		setEditing(b);
	};

	const set = (key: keyof Draft) => (v: string) => {
		setDraft((d) => ({ ...d, [key]: v }));
		setErrors((e) => ({ ...e, [key]: undefined, general: undefined }));
	};

	const setLogin = (key: keyof LoginDraft) => (v: string) => {
		setLoginDraft((d) => ({ ...d, [key]: v }));
		const errKey = ({ name: 'loginName', email: 'loginEmail', phone: 'loginPhone', password: 'loginPassword' } as const)[key];
		setErrors((e) => ({ ...e, [errKey]: undefined, general: undefined }));
	};

	// Switch into a location so the rest of the app (menu, orders, hours, stock) works on it.
	const manage = async (loc: Location, isMain: boolean) => {
		await setActiveVendorId(isMain ? null : loc.id);
		router.navigate('/(vendor)' as never);
	};

	const validateLogin = () => {
		const next: typeof errors = {};
		if (loginDraft.name.trim().length < 2) next.loginName = "Enter the manager's name.";
		if (!EMAIL_RE.test(loginDraft.email.trim())) next.loginEmail = 'Enter a valid email address.';
		const phone = toApiPhone(loginDraft.phone);
		if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) next.loginPhone = 'Enter a valid phone number, e.g. 8031234567.';
		return next;
	};

	const loginBody = () => {
		const phone = toApiPhone(loginDraft.phone);
		return {
			name: loginDraft.name.trim(),
			email: loginDraft.email.trim().toLowerCase(),
			...(phone ? { phone } : {}),
			...(loginDraft.password.trim() ? { password: loginDraft.password.trim() } : {}),
		};
	};

	const save = async () => {
		const next: typeof errors = {};
		if (draft.name.trim().length < 2) next.name = 'Enter a branch name.';
		if (draft.address.trim().length < 3) next.address = 'Enter the street address.';
		if (draft.city.trim().length < 2) next.city = 'Enter the city.';
		const phone = toApiPhone(draft.phone);
		if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) next.phone = 'Enter a valid phone number, e.g. 8031234567.';
		if (editing === 'new' && withLogin) Object.assign(next, validateLogin());
		setErrors(next);
		if (Object.keys(next).length > 0) return;

		try {
			setSaving(true);
			const body: Record<string, unknown> = {
				name: draft.name.trim(),
				address: draft.address.trim(),
				city: draft.city.trim(),
				state: draft.state.trim() || undefined,
				phone,
			};
			// Best effort: a failed lookup keeps the branch, just without a map pin.
			try {
				const hits = await forwardGeocode(
					`${draft.address.trim()}, ${draft.city.trim()}, ${draft.state.trim()}`,
				);
				if (hits.length > 0) {
					body.latitude = hits[0].lat;
					body.longitude = hits[0].lng;
				}
			} catch {
				// ignore
			}

			if (editing === 'new') {
				const res = await api.post('/vendors/me/branches', {
					...body,
					copyMenu,
					...(withLogin ? { manager: loginBody() } : {}),
				});
				const created = res.data.data;
				setEditing(null);
				if (created.login) {
					setHandover({ branch: created.businessName, email: created.login.email, password: created.login.temporaryPassword });
				}
			} else if (editing) {
				await api.patch(`/vendors/me/branches/${editing.id}`, body);
				setEditing(null);
			}
			await load();
		} catch (err) {
			setErrors({ general: apiMessage(err, 'Could not save the branch. Please try again.') });
		} finally {
			setSaving(false);
		}
	};

	const createLogin = async () => {
		if (!loginFor) return;
		const next = validateLogin();
		setErrors(next);
		if (Object.keys(next).length > 0) return;
		try {
			setSaving(true);
			const res = await api.post(`/vendors/me/branches/${loginFor.id}/login`, loginBody());
			setHandover({ branch: loginFor.businessName, email: res.data.data.email, password: res.data.data.temporaryPassword });
			setLoginFor(null);
			await load();
		} catch (err) {
			setErrors({ general: apiMessage(err, 'Could not create the login. Please try again.') });
		} finally {
			setSaving(false);
		}
	};

	const resetPassword = (b: Location) => {
		Alert.alert(
			'Reset password',
			`This signs ${b.manager?.name} out everywhere and gives you a new temporary password to hand over.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Reset',
					style: 'destructive',
					onPress: async () => {
						try {
							const res = await api.post(`/vendors/me/branches/${b.id}/login/reset-password`);
							setHandover({ branch: b.businessName, email: b.manager!.email, password: res.data.data.temporaryPassword });
						} catch (err) {
							Alert.alert('Could not reset', apiMessage(err, 'Please try again.'));
						}
					},
				},
			],
		);
	};

	const toggleAccess = async (b: Location) => {
		const turnOff = b.manager?.isActive !== false;
		try {
			await api.patch(`/vendors/me/branches/${b.id}/login`, { isActive: !turnOff });
			await load();
		} catch (err) {
			Alert.alert('Could not update', apiMessage(err, 'Please try again.'));
		}
	};

	const removeLogin = (b: Location) => {
		Alert.alert(
			'Remove login',
			`${b.manager?.name} will lose access and the branch goes back to being run from your account.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Remove login',
					style: 'destructive',
					onPress: async () => {
						try {
							await api.delete(`/vendors/me/branches/${b.id}/login`);
							await load();
						} catch (err) {
							Alert.alert('Could not remove', apiMessage(err, 'Please try again.'));
						}
					},
				},
			],
		);
	};

	const setNotifyOwner = async (b: Location, value: boolean) => {
		setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, notifyOwnerOfOrders: value } : x)));
		try {
			await api.patch(`/vendors/me/branches/${b.id}`, { notifyOwnerOfOrders: value });
		} catch (err) {
			setBranches((prev) => prev.map((x) => (x.id === b.id ? { ...x, notifyOwnerOfOrders: !value } : x)));
			Alert.alert('Could not update', apiMessage(err, 'Please try again.'));
		}
	};

	const remove = (b: Location) => {
		Alert.alert(
			'Remove branch',
			`Remove ${b.businessName}? Customers will no longer see it${b.manager ? " and the manager's login will be closed" : ''}. Order history is kept.`,
			[
				{ text: 'Keep', style: 'cancel' },
				{
					text: 'Remove',
					style: 'destructive',
					onPress: async () => {
						try {
							await api.delete(`/vendors/me/branches/${b.id}`);
							await setActiveVendorId(null);
							await load();
						} catch (err) {
							Alert.alert('Could not remove', apiMessage(err, 'Please try again.'));
						}
					},
				},
			],
		);
	};

	const copy = (value: string, what: string) => {
		Clipboard.setString(value);
		Alert.alert('Copied', `${what} copied.`);
	};

	const shareHandover = () => {
		if (!handover) return;
		Share.share({
			message:
				`Your GoBuyMe login for ${handover.branch}\n\nEmail: ${handover.email}` +
				(handover.password ? `\nPassword: ${handover.password}\n\nChange the password after you sign in.` : ''),
		}).catch(() => {});
	};

	const statusPill = (l: Location) => {
		const live = l.approvalStatus === 'APPROVED';
		return (
			<View style={[styles.pill, { backgroundColor: live ? T.successBg : T.warningBg }]}>
				<Text style={[styles.pillText, { color: live ? T.success : T.warning }]}>
					{live ? (l.isOpen ? 'Open' : 'Closed') : l.approvalStatus === 'PENDING' ? 'Pending approval' : l.approvalStatus.toLowerCase()}
				</Text>
			</View>
		);
	};

	const loginBlock = (l: Location) => (
		<View style={[styles.loginBox, { borderColor: T.border, backgroundColor: T.bg }]}>
			{l.manager ? (
				<>
					<View style={styles.cardTop}>
						<Text style={[styles.loginTitle, { color: T.text }]} numberOfLines={1}>
							{l.manager.name}
						</Text>
						<View style={[styles.pill, { backgroundColor: !l.manager.isActive ? T.errorBg : l.manager.hasDevice ? T.successBg : T.warningBg }]}>
							<Text style={[styles.pillText, { color: !l.manager.isActive ? T.error : l.manager.hasDevice ? T.success : T.warning }]}>
								{!l.manager.isActive ? 'Access off' : l.manager.hasDevice ? 'Device connected' : 'No device yet'}
							</Text>
						</View>
					</View>
					<Text style={[styles.meta, { color: T.textSec }]} numberOfLines={1}>{l.manager.email}</Text>
					<View style={styles.actions}>
						<TouchableOpacity onPress={() => resetPassword(l)} style={styles.action}>
							<Ionicons name="key-outline" size={15} color={T.primary} />
							<Text style={[styles.actionText, { color: T.primary }]}>Reset password</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={() => toggleAccess(l)} style={styles.action}>
							<Ionicons name={l.manager.isActive ? 'pause-circle-outline' : 'play-circle-outline'} size={15} color={T.textSec} />
							<Text style={[styles.actionText, { color: T.textSec }]}>{l.manager.isActive ? 'Turn access off' : 'Turn access on'}</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={() => removeLogin(l)} style={styles.action}>
							<Ionicons name="close-circle-outline" size={15} color={T.error} />
							<Text style={[styles.actionText, { color: T.error }]}>Remove login</Text>
						</TouchableOpacity>
					</View>
					<View style={styles.switchRow}>
						<Text style={[styles.switchLabel, { color: T.textSec }]}>Also alert me about this branch's orders</Text>
						<Switch
							value={l.notifyOwnerOfOrders}
							onValueChange={(v) => setNotifyOwner(l, v)}
							trackColor={{ true: T.primary, false: T.border }}
						/>
					</View>
				</>
			) : (
				<>
					<Text style={[styles.meta, { color: T.textSec }]}>
						Run from your account. Create a login so a branch manager can use this branch on their own phone and get its alerts there.
					</Text>
					<TouchableOpacity
						onPress={() => { setLoginDraft(EMPTY_LOGIN); setErrors({}); setLoginFor(l); }}
						style={[styles.action, { marginTop: 8 }]}
					>
						<Ionicons name="person-add-outline" size={15} color={T.primary} />
						<Text style={[styles.actionText, { color: T.primary }]}>Create branch login</Text>
					</TouchableOpacity>
				</>
			)}
		</View>
	);

	const card = (l: Location, isMain: boolean) => (
		<View key={l.id} style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
			<View style={styles.cardTop}>
				<Text style={[styles.name, { color: T.text }]} numberOfLines={1}>
					{isMain ? `${l.businessName} (main)` : l.businessName}
				</Text>
				{statusPill(l)}
			</View>
			<Text style={[styles.meta, { color: T.textSec }]}>{l.address}, {l.city}</Text>
			<Text style={[styles.meta, { color: T.textMuted }]}>
				{l._count.menuItems} menu item{l._count.menuItems === 1 ? '' : 's'}
				{l.rating > 0 ? `  ·  ★ ${l.rating.toFixed(1)}` : ''}
				{!isMain && l.contactPhone ? `  ·  ${l.contactPhone}` : ''}
			</Text>
			<View style={styles.actions}>
				<TouchableOpacity onPress={() => manage(l, isMain)} style={styles.action}>
					<Ionicons name="storefront-outline" size={16} color={T.primary} />
					<Text style={[styles.actionText, { color: T.primary }]}>Manage this location</Text>
				</TouchableOpacity>
				{!isMain && (
					<>
						<TouchableOpacity onPress={() => openEdit(l)} style={styles.action}>
							<Ionicons name="create-outline" size={16} color={T.textSec} />
							<Text style={[styles.actionText, { color: T.textSec }]}>Details</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={() => remove(l)} style={styles.action}>
							<Ionicons name="trash-outline" size={16} color={T.error} />
							<Text style={[styles.actionText, { color: T.error }]}>Remove</Text>
						</TouchableOpacity>
					</>
				)}
			</View>
			{!isMain && loginBlock(l)}
		</View>
	);

	const loginFields = (
		<>
			<AppInput label="Manager's name" value={loginDraft.name} onChangeText={setLogin('name')} placeholder="Ada Obi" error={errors.loginName} />
			<AppInput
				label="Sign-in email"
				value={loginDraft.email}
				onChangeText={setLogin('email')}
				placeholder="manager@example.com"
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
				error={errors.loginEmail}
			/>
			<AppInput
				label="Manager's phone (optional)"
				value={loginDraft.phone}
				onChangeText={setLogin('phone')}
				placeholder="8031234567"
				keyboardType="phone-pad"
				prefix="+234"
				error={errors.loginPhone}
			/>
			<AppInput
				label="Password (optional)"
				value={loginDraft.password}
				onChangeText={setLogin('password')}
				placeholder="Leave blank to generate one"
				autoCapitalize="none"
				autoCorrect={false}
				error={errors.loginPassword}
			/>
		</>
	);

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
				<TouchableOpacity onPress={() => router.navigate('/(vendor)/profile' as never)} style={styles.back}>
					<Ionicons name="chevron-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Locations</Text>
				<Text style={[styles.sub, { color: T.textSec }]}>
					Every branch is its own store: separate menu, stock, hours and orders, listed on its own to customers.
					You manage all of them from this account, and can give each branch manager their own login.
				</Text>

				{loading ? (
					<ActivityIndicator color={T.primary} style={{ marginTop: 32 }} />
				) : (
					<>
						{main && card(main, true)}
						{branches.map((b) => card(b, false))}
						{branches.length === 0 && (
							<Text style={[styles.empty, { color: T.textMuted }]}>No branches yet.</Text>
						)}
						{branches.length < max ? (
							<PrimaryButton onPress={openNew}>Add a branch</PrimaryButton>
						) : (
							<Text style={[styles.empty, { color: T.textMuted }]}>You have reached the limit of {max} branches.</Text>
						)}
					</>
				)}
			</ScrollView>

			{/* Add / edit a branch */}
			<CenteredKeyboardModal visible={!!editing} onRequestClose={() => setEditing(null)} onBackdropPress={() => setEditing(null)} maxHeight="90%">
				<ScrollView keyboardShouldPersistTaps="handled">
					<Text style={[styles.modalTitle, { color: T.text }]}>{editing === 'new' ? 'Add a branch' : 'Branch details'}</Text>
					<AppInput label="Branch name" value={draft.name} onChangeText={set('name')} placeholder="e.g. Rumuola" error={errors.name} />
					<AppInput label="Street address" value={draft.address} onChangeText={set('address')} placeholder="5 Rumuola Road" error={errors.address} />
					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<AppInput label="City" value={draft.city} onChangeText={set('city')} error={errors.city} />
						</View>
						<View style={{ flex: 1 }}>
							<AppInput label="State" value={draft.state} onChangeText={set('state')} />
						</View>
					</View>
					<AppInput
						label="Branch phone (optional)"
						value={draft.phone}
						onChangeText={set('phone')}
						placeholder="8031234567"
						keyboardType="phone-pad"
						prefix="+234"
						error={errors.phone}
					/>
					{editing === 'new' && (
						<>
							<View style={[styles.toggleRow, { borderColor: T.border }]}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleTitle, { color: T.text }]}>Start with my main menu</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>
										Copies items and prices. Stock starts at 0 so you set what this branch actually has.
									</Text>
								</View>
								<Switch value={copyMenu} onValueChange={setCopyMenu} trackColor={{ true: T.primary, false: T.border }} />
							</View>
							<View style={[styles.toggleRow, { borderColor: T.border }]}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleTitle, { color: T.text }]}>Create a login for the manager</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>
										They sign in on their own phone and get this branch's alerts there. You can also do this later.
									</Text>
								</View>
								<Switch value={withLogin} onValueChange={setWithLogin} trackColor={{ true: T.primary, false: T.border }} />
							</View>
							{withLogin && loginFields}
						</>
					)}
					{!!errors.general && <Text style={[styles.error, { color: T.error }]}>{errors.general}</Text>}
					<PrimaryButton onPress={save} loading={saving}>
						Save
					</PrimaryButton>
					<TouchableOpacity onPress={() => setEditing(null)} style={{ alignItems: 'center', marginTop: 12 }}>
						<Text style={{ color: T.textSec, fontSize: 14 }}>Cancel</Text>
					</TouchableOpacity>
				</ScrollView>
			</CenteredKeyboardModal>

			{/* Create a login for an existing branch */}
			<CenteredKeyboardModal visible={!!loginFor} onRequestClose={() => setLoginFor(null)} onBackdropPress={() => setLoginFor(null)} maxHeight="90%">
				<ScrollView keyboardShouldPersistTaps="handled">
					<Text style={[styles.modalTitle, { color: T.text }]}>Branch login</Text>
					<Text style={[styles.toggleSub, { color: T.textSec, marginBottom: 14 }]}>
						For {loginFor?.businessName}. The manager gets access to this branch only: its menu, stock, hours and orders.
					</Text>
					{loginFields}
					{!!errors.general && <Text style={[styles.error, { color: T.error }]}>{errors.general}</Text>}
					<PrimaryButton onPress={createLogin} loading={saving}>
						Create login
					</PrimaryButton>
					<TouchableOpacity onPress={() => setLoginFor(null)} style={{ alignItems: 'center', marginTop: 12 }}>
						<Text style={{ color: T.textSec, fontSize: 14 }}>Cancel</Text>
					</TouchableOpacity>
				</ScrollView>
			</CenteredKeyboardModal>

			{/* Hand-over details: shown once */}
			<CenteredKeyboardModal visible={!!handover} onRequestClose={() => setHandover(null)}>
				<Text style={[styles.modalTitle, { color: T.text }]}>Share these with the manager</Text>
				<Text style={[styles.toggleSub, { color: T.textSec, marginBottom: 14 }]}>
					{handover?.password
						? "This password is shown only now and can't be viewed again. If it is lost, reset it."
						: 'The manager signs in with the password you chose.'}
				</Text>
				<View style={[styles.credBox, { borderColor: T.border, backgroundColor: T.bg }]}>
					<Text style={[styles.credLabel, { color: T.textSec }]}>Email</Text>
					<TouchableOpacity onPress={() => handover && copy(handover.email, 'Email')}>
						<Text style={[styles.credValue, { color: T.text }]} selectable>{handover?.email}</Text>
					</TouchableOpacity>
					{!!handover?.password && (
						<>
							<Text style={[styles.credLabel, { color: T.textSec, marginTop: 12 }]}>Temporary password</Text>
							<TouchableOpacity onPress={() => handover.password && copy(handover.password, 'Password')}>
								<Text style={[styles.credValue, { color: T.text, fontFamily: 'Courier' }]} selectable>{handover.password}</Text>
							</TouchableOpacity>
						</>
					)}
				</View>
				<PrimaryButton onPress={shareHandover}>Share details</PrimaryButton>
				<TouchableOpacity onPress={() => setHandover(null)} style={{ alignItems: 'center', marginTop: 12 }}>
					<Text style={{ color: T.textSec, fontSize: 14 }}>Done</Text>
				</TouchableOpacity>
			</CenteredKeyboardModal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingBottom: 120 },
	back: { marginBottom: 12, alignSelf: 'flex-start' },
	title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' },
	sub: { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 20, fontFamily: 'PlusJakartaSans_400Regular' },
	card: { borderWidth: 1, borderRadius: 4, padding: 14, marginBottom: 12, gap: 4 },
	cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
	name: { fontSize: 15, fontWeight: '700', flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold' },
	meta: { fontSize: 12, lineHeight: 17, fontFamily: 'PlusJakartaSans_400Regular' },
	pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
	pillText: { fontSize: 11, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
	actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
	action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	actionText: { fontSize: 13, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
	loginBox: { borderWidth: 1, borderRadius: 4, padding: 12, marginTop: 12, gap: 2 },
	loginTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold' },
	switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
	switchLabel: { fontSize: 12, flex: 1, fontFamily: 'PlusJakartaSans_500Medium' },
	empty: { fontSize: 13, textAlign: 'center', marginVertical: 16, fontFamily: 'PlusJakartaSans_400Regular' },
	modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, fontFamily: 'PlusJakartaSans_800ExtraBold' },
	row: { flexDirection: 'row', gap: 12 },
	toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 4, padding: 12, marginBottom: 12 },
	toggleTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' },
	toggleSub: { fontSize: 12, lineHeight: 17, marginTop: 2, fontFamily: 'PlusJakartaSans_400Regular' },
	error: { fontSize: 13, marginBottom: 12, fontFamily: 'PlusJakartaSans_400Regular' },
	credBox: { borderWidth: 1, borderRadius: 4, padding: 14, marginBottom: 16 },
	credLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_700Bold' },
	credValue: { fontSize: 16, fontWeight: '700', marginTop: 2, fontFamily: 'PlusJakartaSans_700Bold' },
});
