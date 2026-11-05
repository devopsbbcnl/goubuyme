import React, { useCallback, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	RefreshControl,
	ActivityIndicator,
	TouchableOpacity,
	Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import api from '@/services/api';

interface FleetRider {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	vehicleType: string;
	plateNumber: string | null;
	isOnline: boolean;
	rating: number;
	deliveries: number;
	approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
}

interface FleetInvite {
	id: string;
	email: string;
	expiresAt: string;
	expired: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const apiMessage = (err: unknown, fallback: string) =>
	(err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export default function CompanyFleetScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [riders, setRiders] = useState<FleetRider[]>([]);
	const [invites, setInvites] = useState<FleetInvite[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [email, setEmail] = useState('');
	const [emailError, setEmailError] = useState<string | undefined>();
	const [inviting, setInviting] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await api.get('/company/me/fleet');
			setRiders(res.data.data.riders);
			setInvites(res.data.data.invites);
		} catch {
			// keep what we have; pull to refresh retries
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			load();
		}, [load]),
	);

	const sendInvite = async () => {
		const value = email.trim().toLowerCase();
		if (!EMAIL_RE.test(value)) {
			setEmailError('Enter a valid email address.');
			return;
		}
		try {
			setInviting(true);
			setEmailError(undefined);
			setNotice(null);
			await api.post('/company/me/fleet/invites', { email: value });
			setEmail('');
			setNotice(`Invite sent to ${value}.`);
			await load();
		} catch (err) {
			setEmailError(apiMessage(err, 'Could not send the invite. Please try again.'));
		} finally {
			setInviting(false);
		}
	};

	const revoke = (invite: FleetInvite) => {
		Alert.alert('Cancel invite', `Cancel the invite to ${invite.email}?`, [
			{ text: 'Keep', style: 'cancel' },
			{
				text: 'Cancel invite',
				style: 'destructive',
				onPress: async () => {
					try {
						await api.delete(`/company/me/fleet/invites/${invite.id}`);
						await load();
					} catch (err) {
						Alert.alert('Could not cancel', apiMessage(err, 'Please try again.'));
					}
				},
			},
		]);
	};

	const removeRider = (rider: FleetRider) => {
		Alert.alert(
			'Remove rider',
			`Remove ${rider.name} from your fleet? If joining your fleet was how they were approved, they will need to be approved again.`,
			[
				{ text: 'Keep', style: 'cancel' },
				{
					text: 'Remove',
					style: 'destructive',
					onPress: async () => {
						try {
							await api.delete(`/company/me/fleet/riders/${rider.id}`);
							await load();
						} catch (err) {
							Alert.alert('Could not remove', apiMessage(err, 'Please try again.'));
						}
					},
				},
			],
		);
	};

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
			keyboardShouldPersistTaps="handled"
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={() => {
						setRefreshing(true);
						load();
					}}
					tintColor={T.primary}
				/>
			}
		>
			<Text style={[styles.title, { color: T.text }]}>Your fleet</Text>
			<Text style={[styles.sub, { color: T.textSec }]}>
				Invite riders by email. They join automatically when they sign up or sign in as a rider with that address.
			</Text>

			<AppInput
				label="Rider email"
				value={email}
				onChangeText={(v) => {
					setEmail(v);
					setEmailError(undefined);
					setNotice(null);
				}}
				placeholder="rider@example.com"
				keyboardType="email-address"
				autoCapitalize="none"
				autoCorrect={false}
				error={emailError}
			/>
			{!!notice && <Text style={[styles.notice, { color: T.success }]}>{notice}</Text>}
			<PrimaryButton onPress={sendInvite} loading={inviting}>
				Send invite
			</PrimaryButton>

			{loading ? (
				<ActivityIndicator color={T.primary} style={{ marginTop: 32 }} />
			) : (
				<>
					<Text style={[styles.section, { color: T.textSec }]}>Riders ({riders.length})</Text>
					{riders.length === 0 && (
						<Text style={[styles.empty, { color: T.textMuted }]}>
							No riders yet. Invited riders show up here once they join.
						</Text>
					)}
					{riders.map((r) => (
						<View key={r.id} style={[styles.row, { backgroundColor: T.surface, borderColor: T.border }]}>
							<View style={{ flex: 1 }}>
								<View style={styles.nameRow}>
									<View style={[styles.dot, { backgroundColor: r.isOnline ? T.success : T.textMuted }]} />
									<Text style={[styles.name, { color: T.text }]} numberOfLines={1}>
										{r.name}
									</Text>
								</View>
								<Text style={[styles.meta, { color: T.textSec }]} numberOfLines={1}>
									{r.vehicleType}
									{r.plateNumber ? ` · ${r.plateNumber}` : ''} · {r.deliveries} deliveries
								</Text>
								<Text style={[styles.meta, { color: T.textMuted }]} numberOfLines={1}>
									{r.email}
								</Text>
								{r.approvalStatus !== 'APPROVED' && (
									<Text style={[styles.meta, { color: T.warning }]}>
										{r.approvalStatus === 'PENDING' ? 'Waiting for approval' : r.approvalStatus.toLowerCase()}
									</Text>
								)}
							</View>
							<TouchableOpacity
								onPress={() => removeRider(r)}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								accessibilityLabel={`Remove ${r.name}`}
							>
								<Ionicons name="person-remove-outline" size={20} color={T.textMuted} />
							</TouchableOpacity>
						</View>
					))}

					<Text style={[styles.section, { color: T.textSec }]}>Open invites ({invites.length})</Text>
					{invites.length === 0 && (
						<Text style={[styles.empty, { color: T.textMuted }]}>No open invites.</Text>
					)}
					{invites.map((i) => (
						<View key={i.id} style={[styles.row, { backgroundColor: T.surface, borderColor: T.border }]}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.name, { color: T.text }]} numberOfLines={1}>
									{i.email}
								</Text>
								<Text style={[styles.meta, { color: i.expired ? T.error : T.textSec }]}>
									{i.expired
										? 'Expired. Send a new invite to reopen it.'
										: `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
								</Text>
							</View>
							<TouchableOpacity
								onPress={() => revoke(i)}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								accessibilityLabel={`Cancel invite to ${i.email}`}
							>
								<Ionicons name="close-circle-outline" size={22} color={T.textMuted} />
							</TouchableOpacity>
						</View>
					))}
				</>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingBottom: 120 },
	title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' },
	sub: { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 20, fontFamily: 'PlusJakartaSans_400Regular' },
	notice: { fontSize: 12, marginBottom: 10, fontFamily: 'PlusJakartaSans_500Medium' },
	section: {
		fontSize: 11,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginTop: 28,
		marginBottom: 10,
		fontFamily: 'PlusJakartaSans_700Bold',
	},
	empty: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		borderWidth: 1,
		borderRadius: 4,
		padding: 14,
		marginBottom: 10,
	},
	nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	name: { fontSize: 15, fontWeight: '700', flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold' },
	meta: { fontSize: 12, marginTop: 2, fontFamily: 'PlusJakartaSans_400Regular' },
});
