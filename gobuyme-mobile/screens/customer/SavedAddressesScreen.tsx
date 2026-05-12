import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Modal,
	Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAddress, AddressType, Address } from '@/context/AddressContext';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TYPE_ICONS: Record<AddressType, string> = {
	home: 'home',
	work: 'business',
	other: 'location-on',
};
const TYPE_LABELS: AddressType[] = ['home', 'work', 'other'];

export default function SavedAddressesScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { addresses, addAddress, updateAddress, deleteAddress, setDefault } =
		useAddress();

	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<Address | null>(null);
	const [form, setForm] = useState({
		type: 'home' as AddressType,
		label: '',
		address: '',
		city: '',
		state: '',
	});
	const [saving, setSaving] = useState(false);

	const openAdd = () => {
		setEditing(null);
		setForm({ type: 'home', label: '', address: '', city: '', state: '' });
		setModalVisible(true);
	};

	const openEdit = (addr: Address) => {
		setEditing(addr);
		setForm({
			type: addr.type,
			label: addr.label,
			address: addr.address,
			city: addr.city ?? '',
			state: addr.state ?? '',
		});
		setModalVisible(true);
	};

	const handleSave = async () => {
		if (
			!form.label.trim() ||
			!form.address.trim() ||
			!form.city.trim() ||
			!form.state.trim()
		) {
			Alert.alert('Required', 'Please fill in all fields.');
			return;
		}
		const payload = {
			type: form.type,
			label: form.label.trim(),
			address: form.address.trim(),
			city: form.city.trim(),
			state: form.state.trim(),
		};
		try {
			setSaving(true);
			if (editing) {
				await updateAddress(editing.id, payload);
			} else {
				await addAddress(payload);
			}
			setModalVisible(false);
		} catch {
			Alert.alert(
				'Save failed',
				'Could not save this address to your account. Please try again.',
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = (id: string) => {
		Alert.alert('Delete Address', 'Remove this saved address?', [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteAddress(id);
					} catch {
						Alert.alert(
							'Delete failed',
							'Could not remove this address from your account. Please try again.',
						);
					}
				},
			},
		]);
	};

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Saved Addresses</Text>
				<TouchableOpacity
					onPress={openAdd}
					style={styles.addBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="add" size={24} color={T.primary} />
				</TouchableOpacity>
			</View>

			<ScrollView
				contentContainerStyle={styles.scroll}
				showsVerticalScrollIndicator={false}
			>
				{addresses.length === 0 ? (
					<View style={styles.empty}>
						<Ionicons name="location-outline" size={48} color={T.textMuted} />
						<Text style={[styles.emptyTitle, { color: T.text }]}>
							No saved addresses
						</Text>
						<Text style={[styles.emptySub, { color: T.textSec }]}>
							Add your home, work, or other frequent locations for faster
							checkout
						</Text>
						<TouchableOpacity
							onPress={openAdd}
							style={[styles.emptyBtn, { backgroundColor: T.primary }]}
						>
							<Text style={styles.emptyBtnText}>Add Address</Text>
						</TouchableOpacity>
					</View>
				) : (
					<>
						{addresses.map((addr) => (
							<View
								key={addr.id}
								style={[
									styles.card,
									{
										backgroundColor: T.surface,
										borderColor: addr.isDefault ? T.primary : T.border,
									},
								]}
							>
								<View
									style={[styles.iconWrap, { backgroundColor: T.primaryTint }]}
								>
									<MaterialIcons
										name={TYPE_ICONS[addr.type] as any}
										size={20}
										color={T.primary}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 8,
										}}
									>
										<Text style={[styles.cardLabel, { color: T.text }]}>
											{addr.label}
										</Text>
										{addr.isDefault && (
											<View
												style={[
													styles.defaultBadge,
													{ backgroundColor: T.primaryTint },
												]}
											>
												<Text
													style={[styles.defaultText, { color: T.primary }]}
												>
													Default
												</Text>
											</View>
										)}
									</View>
									<Text style={[styles.cardAddr, { color: T.textSec }]}>
										{addr.address}
									</Text>
									<Text style={[styles.cardAddrMeta, { color: T.textMuted }]}>
										{[addr.city, addr.state].filter(Boolean).join(', ')}
									</Text>
									<View style={styles.cardActions}>
										{!addr.isDefault && (
											<TouchableOpacity
												onPress={async () => {
													try {
														await setDefault(addr.id);
													} catch {
														Alert.alert(
															'Update failed',
															'Could not update your default address. Please try again.',
														);
													}
												}}
											>
												<Text style={[styles.actionText, { color: T.primary }]}>
													Set as default
												</Text>
											</TouchableOpacity>
										)}
										<TouchableOpacity onPress={() => openEdit(addr)}>
											<Text style={[styles.actionText, { color: T.textSec }]}>
												Edit
											</Text>
										</TouchableOpacity>
										<TouchableOpacity onPress={() => handleDelete(addr.id)}>
											<Text style={[styles.actionText, { color: T.error }]}>
												Delete
											</Text>
										</TouchableOpacity>
									</View>
								</View>
							</View>
						))}
						<TouchableOpacity
							onPress={openAdd}
							style={[styles.addRow, { borderColor: T.border }]}
							activeOpacity={0.75}
						>
							<Ionicons name="add-circle-outline" size={20} color={T.primary} />
							<Text style={[styles.addRowText, { color: T.primary }]}>
								Add New Address
							</Text>
						</TouchableOpacity>
					</>
				)}
			</ScrollView>

			{/* Add/Edit modal */}
			<Modal visible={modalVisible} animationType="slide" transparent>
				<View style={styles.modalBackdrop}>
					<View style={[styles.modalSheet, { backgroundColor: T.surface }]}>
						<View style={styles.modalHeader}>
							<Text style={[styles.modalTitle, { color: T.text }]}>
								{editing ? 'Edit Address' : 'New Address'}
							</Text>
							<TouchableOpacity onPress={() => setModalVisible(false)}>
								<Ionicons name="close" size={22} color={T.textSec} />
							</TouchableOpacity>
						</View>

						{/* Type picker */}
						<Text style={[styles.fLabel, { color: T.textSec }]}>Type</Text>
						<View style={styles.typePicker}>
							{TYPE_LABELS.map((t) => (
								<TouchableOpacity
									key={t}
									onPress={() =>
										setForm((f) => ({
											...f,
											type: t,
											label:
												t !== 'other'
													? t.charAt(0).toUpperCase() + t.slice(1)
													: f.label,
										}))
									}
									style={[
										styles.typeBtn,
										{
											borderColor: form.type === t ? T.primary : T.border,
											backgroundColor:
												form.type === t ? T.primaryTint : T.surface2,
										},
									]}
								>
									<MaterialIcons
										name={TYPE_ICONS[t] as any}
										size={16}
										color={form.type === t ? T.primary : T.textSec}
									/>
									<Text
										style={[
											styles.typeBtnText,
											{ color: form.type === t ? T.primary : T.textSec },
										]}
									>
										{t.charAt(0).toUpperCase() + t.slice(1)}
									</Text>
								</TouchableOpacity>
							))}
						</View>

						<Text style={[styles.fLabel, { color: T.textSec }]}>Label</Text>
						<TextInput
							value={form.label}
							onChangeText={(v) => setForm((f) => ({ ...f, label: v }))}
							placeholder="e.g. Home, Office, Mum's house"
							placeholderTextColor={T.textMuted}
							style={[
								styles.fInput,
								{
									backgroundColor: T.surface2,
									borderColor: T.border,
									color: T.text,
								},
							]}
						/>

						<Text style={[styles.fLabel, { color: T.textSec }]}>
							Full Address
						</Text>
						<TextInput
							value={form.address}
							onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
							placeholder="Street, area, city"
							placeholderTextColor={T.textMuted}
							multiline
							numberOfLines={2}
							style={[
								styles.fInput,
								styles.fTextarea,
								{
									backgroundColor: T.surface2,
									borderColor: T.border,
									color: T.text,
								},
							]}
						/>

						<View style={styles.locationRow}>
							<View style={styles.locationField}>
								<Text style={[styles.fLabel, { color: T.textSec }]}>City</Text>
								<TextInput
									value={form.city}
									onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
									placeholder="Owerri"
									placeholderTextColor={T.textMuted}
									style={[
										styles.fInput,
										{
											backgroundColor: T.surface2,
											borderColor: T.border,
											color: T.text,
										},
									]}
								/>
							</View>

							<View style={styles.locationField}>
								<Text style={[styles.fLabel, { color: T.textSec }]}>State</Text>
								<TextInput
									value={form.state}
									onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
									placeholder="Imo"
									placeholderTextColor={T.textMuted}
									style={[
										styles.fInput,
										{
											backgroundColor: T.surface2,
											borderColor: T.border,
											color: T.text,
										},
									]}
								/>
							</View>
						</View>

						<TouchableOpacity
							onPress={handleSave}
							disabled={saving}
							style={[
								styles.modalSaveBtn,
								{ backgroundColor: saving ? T.surface3 : T.primary },
							]}
							activeOpacity={0.85}
						>
							<Text style={styles.modalSaveBtnText}>
								{saving ? 'Saving...' : 'Save Address'}
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>
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
	addBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 17, fontWeight: '700' },
	scroll: { padding: 20, gap: 12, paddingBottom: 40 },
	empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
	emptyTitle: { fontSize: 17, fontWeight: '700' },
	emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
	emptyBtn: {
		marginTop: 8,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 4,
	},
	emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
	card: {
		flexDirection: 'row',
		gap: 14,
		borderRadius: 4,
		borderWidth: 1.5,
		padding: 14,
	},
	iconWrap: {
		width: 40,
		height: 40,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	cardLabel: { fontSize: 14, fontWeight: '700' },
	defaultBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
	defaultText: { fontSize: 10, fontWeight: '700' },
	cardAddr: { fontSize: 12, marginTop: 3, lineHeight: 18 },
	cardAddrMeta: { fontSize: 11, marginTop: 2 },
	cardActions: { flexDirection: 'row', gap: 14, marginTop: 10 },
	actionText: { fontSize: 12, fontWeight: '600' },
	addRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		padding: 16,
		borderRadius: 4,
		borderWidth: 1.5,
		borderStyle: 'dashed',
	},
	addRowText: { fontSize: 14, fontWeight: '600' },
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
		gap: 12,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 4,
	},
	modalTitle: { fontSize: 17, fontWeight: '700' },
	typePicker: { flexDirection: 'row', gap: 10, marginBottom: 4 },
	typeBtn: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 10,
		borderRadius: 4,
		borderWidth: 1.5,
	},
	typeBtnText: { fontSize: 13, fontWeight: '600' },
	fLabel: {
		fontSize: 11,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	fInput: {
		height: 44,
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
		fontSize: 14,
	},
	fTextarea: { height: 72, paddingTop: 10, textAlignVertical: 'top' },
	locationRow: { flexDirection: 'row', gap: 12 },
	locationField: { flex: 1, gap: 6 },
	modalSaveBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
		marginTop: 4,
	},
	modalSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
