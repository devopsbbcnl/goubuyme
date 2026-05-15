import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Image,
	ActivityIndicator,
	Modal,
	TextInput,
	Switch,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

interface DrinkOption {
	id: string;
	name: string;
	price: number;
	isAvailable: boolean;
}

interface MenuItem {
	id: string;
	name: string;
	description: string | null;
	price: number;
	image: string | null;
	category: string | null;
	isAvailable: boolean;
	isFeatured: boolean;
	drinkOptions: DrinkOption[];
}

interface FormState {
	name: string;
	description: string;
	price: string;
	category: string;
	image: string | null;
	isAvailable: boolean;
	isFeatured: boolean;
}

const EMPTY_FORM: FormState = {
	name: '',
	description: '',
	price: '',
	category: '',
	image: null,
	isAvailable: true,
	isFeatured: false,
};

const CATEGORIES = [
	'Meals',
	'Drinks',
	'Snacks',
	'Pastries',
	'Sides',
	'Desserts',
	'Other',
];

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function formatPrice(n: number) {
	return (
		'₦' +
		n.toLocaleString('en-NG', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		})
	);
}

async function uploadImage(uri: string): Promise<string> {
	if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
		throw new Error('Cloudinary configuration is missing.');
	}

	const formData = new FormData();
	formData.append('file', {
		uri,
		type: 'image/jpeg',
		name: 'menu-item.jpg',
	} as any);
	formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
	const res = await fetch(
		`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
		{
			method: 'POST',
			body: formData,
		},
	);
	if (!res.ok) return uri;
	const data = await res.json();
	return data.secure_url ?? uri;
}

export default function ManageMenuScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();

	const [items, setItems] = useState<MenuItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [sheetVisible, setSheetVisible] = useState(false);
	const [editing, setEditing] = useState<MenuItem | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [catOpen, setCatOpen] = useState(false);

	// Drink options sheet state
	const [drinkSheetItem, setDrinkSheetItem] = useState<MenuItem | null>(null);
	const [drinkName, setDrinkName] = useState('');
	const [drinkPrice, setDrinkPrice] = useState('');
	const [drinkSaving, setDrinkSaving] = useState(false);

	const fetchItems = useCallback(async () => {
		try {
			const res = await api.get('/vendors/me/menu');
			setItems(res.data.data ?? []);
		} catch {
			Alert.alert('Error', 'Could not load menu items.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchItems();
	}, [fetchItems]);

	const openAdd = () => {
		setEditing(null);
		setForm(EMPTY_FORM);
		setCatOpen(false);
		setSheetVisible(true);
	};

	const openEdit = (item: MenuItem) => {
		setEditing(item);
		setForm({
			name: item.name,
			description: item.description ?? '',
			price: String(item.price),
			category: item.category ?? '',
			image: item.image,
			isAvailable: item.isAvailable,
			isFeatured: item.isFeatured,
		});
		setCatOpen(false);
		setSheetVisible(true);
	};

	const closeSheet = () => {
		setSheetVisible(false);
		setEditing(null);
	};

	const pickImage = async () => {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== 'granted') {
			Alert.alert('Permission needed', 'Allow photo access to upload images.');
			return;
		}
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: 0.8,
		});
		if (!result.canceled && result.assets[0]) {
			setForm((f) => ({ ...f, image: result.assets[0].uri }));
		}
	};

	const handleSave = async () => {
		const name = form.name.trim();
		const price = parseFloat(form.price);
		if (!name) {
			Alert.alert('Validation', 'Item name is required.');
			return;
		}
		if (!form.price || isNaN(price) || price <= 0) {
			Alert.alert('Validation', 'Enter a valid price greater than 0.');
			return;
		}

		setSaving(true);
		try {
			let imageUrl = form.image;
			if (imageUrl && imageUrl.startsWith('file://')) {
				imageUrl = await uploadImage(imageUrl);
			}

			const payload: Record<string, unknown> = {
				name,
				price,
				description: form.description.trim() || null,
				category: form.category || null,
				image: imageUrl,
				isAvailable: form.isAvailable,
				isFeatured: form.isFeatured,
			};

			if (editing) {
				await api.patch(`/vendors/me/menu/${editing.id}`, payload);
				setItems((prev) =>
					prev.map((it) =>
						it.id === editing.id
							? ({ ...it, ...payload, id: editing.id } as MenuItem)
							: it,
					),
				);
			} else {
				const res = await api.post('/vendors/me/menu', payload);
				setItems((prev) => [res.data.data, ...prev]);
			}
			closeSheet();
		} catch (err: any) {
			const msg = err?.response?.data?.message ?? 'Could not save item.';
			Alert.alert('Error', msg);
		} finally {
			setSaving(false);
		}
	};

	const toggleAvailable = async (item: MenuItem) => {
		const next = !item.isAvailable;
		setItems((prev) =>
			prev.map((it) => (it.id === item.id ? { ...it, isAvailable: next } : it)),
		);
		try {
			await api.patch(`/vendors/me/menu/${item.id}`, { isAvailable: next });
		} catch {
			setItems((prev) =>
				prev.map((it) =>
					it.id === item.id ? { ...it, isAvailable: item.isAvailable } : it,
				),
			);
		}
	};

	const handleDelete = (item: MenuItem) => {
		Alert.alert('Delete item', `Remove "${item.name}" from your menu?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Delete',
				style: 'destructive',
				onPress: async () => {
					try {
						await api.delete(`/vendors/me/menu/${item.id}`);
						setItems((prev) => prev.filter((it) => it.id !== item.id));
					} catch (err: any) {
						const msg =
							err?.response?.data?.message ?? 'Could not delete item.';
						Alert.alert('Error', msg);
					}
				},
			},
		]);
	};

	const openDrinkSheet = (item: MenuItem) => {
		setDrinkSheetItem(item);
		setDrinkName('');
		setDrinkPrice('');
	};

	const closeDrinkSheet = () => setDrinkSheetItem(null);

	const handleAddDrink = async () => {
		if (!drinkSheetItem) return;
		const name = drinkName.trim();
		const price = parseFloat(drinkPrice);
		if (!name) { Alert.alert('Validation', 'Drink name is required.'); return; }
		if (isNaN(price) || price < 0) { Alert.alert('Validation', 'Enter a valid price (0 or more).'); return; }

		setDrinkSaving(true);
		try {
			const res = await api.post(`/vendors/me/menu/${drinkSheetItem.id}/drink-options`, { name, price });
			const newOption: DrinkOption = res.data.data;
			setItems(prev => prev.map(it =>
				it.id === drinkSheetItem.id
					? { ...it, drinkOptions: [...it.drinkOptions, newOption].sort((a, b) => a.price - b.price) }
					: it,
			));
			setDrinkSheetItem(prev => prev ? { ...prev, drinkOptions: [...prev.drinkOptions, newOption].sort((a, b) => a.price - b.price) } : null);
			setDrinkName('');
			setDrinkPrice('');
		} catch (err: any) {
			Alert.alert('Error', err?.response?.data?.message ?? 'Could not add drink option.');
		} finally {
			setDrinkSaving(false);
		}
	};

	const handleToggleDrink = async (item: MenuItem, option: DrinkOption) => {
		const next = !option.isAvailable;
		const update = (it: MenuItem) => it.id === item.id
			? { ...it, drinkOptions: it.drinkOptions.map(d => d.id === option.id ? { ...d, isAvailable: next } : d) }
			: it;
		setItems(prev => prev.map(update));
		setDrinkSheetItem(prev => prev ? update(prev) : null);
		try {
			await api.patch(`/vendors/me/menu/${item.id}/drink-options/${option.id}`, { isAvailable: next });
		} catch {
			const revert = (it: MenuItem) => it.id === item.id
				? { ...it, drinkOptions: it.drinkOptions.map(d => d.id === option.id ? { ...d, isAvailable: option.isAvailable } : d) }
				: it;
			setItems(prev => prev.map(revert));
			setDrinkSheetItem(prev => prev ? revert(prev) : null);
		}
	};

	const handleDeleteDrink = (item: MenuItem, option: DrinkOption) => {
		Alert.alert('Remove drink', `Remove "${option.name}" from this item?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Remove', style: 'destructive', onPress: async () => {
					try {
						await api.delete(`/vendors/me/menu/${item.id}/drink-options/${option.id}`);
						const remove = (it: MenuItem) => it.id === item.id
							? { ...it, drinkOptions: it.drinkOptions.filter(d => d.id !== option.id) }
							: it;
						setItems(prev => prev.map(remove));
						setDrinkSheetItem(prev => prev ? remove(prev) : null);
					} catch (err: any) {
						Alert.alert('Error', err?.response?.data?.message ?? 'Could not remove drink option.');
					}
				},
			},
		]);
	};

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[
					styles.headerRow,
					{ paddingTop: insets.top + 16, borderBottomColor: T.border },
				]}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.iconBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.pageTitle, { color: T.text }]}>Menu Items</Text>
				<TouchableOpacity
					onPress={openAdd}
					style={[styles.addBtn, { backgroundColor: T.primary }]}
				>
					<Ionicons name="add" size={18} color="#fff" />
					<Text style={styles.addBtnText}>Add</Text>
				</TouchableOpacity>
			</View>

			{loading ? (
				<View
					style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
				>
					<ActivityIndicator color={T.primary} />
				</View>
			) : items.length === 0 ? (
				<View
					style={{
						flex: 1,
						alignItems: 'center',
						justifyContent: 'center',
						paddingHorizontal: 40,
					}}
				>
					<Text style={{ fontSize: 40, marginBottom: 12 }}>🍽️</Text>
					<Text style={[styles.emptyTitle, { color: T.text }]}>
						No menu items yet
					</Text>
					<Text style={[styles.emptySub, { color: T.textSec }]}>
						Tap Add to create your first item
					</Text>
				</View>
			) : (
				<ScrollView
					contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
					showsVerticalScrollIndicator={false}
				>
					{items.map((item) => (
						<ItemCard
							key={item.id}
							item={item}
							T={T}
							onEdit={() => openEdit(item)}
							onDelete={() => handleDelete(item)}
							onToggle={() => toggleAvailable(item)}
							onDrinks={() => openDrinkSheet(item)}
						/>
					))}
				</ScrollView>
			)}

			{/* Drink options sheet */}
			<Modal
				visible={!!drinkSheetItem}
				animationType="slide"
				transparent
				onRequestClose={closeDrinkSheet}
			>
				<Pressable style={styles.backdrop} onPress={closeDrinkSheet} />
				<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrap}>
					<View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border }]}>
						<View style={[styles.sheetHeader, { borderBottomColor: T.border }]}>
							<Text style={[styles.sheetTitle, { color: T.text }]}>Drink Options</Text>
							<TouchableOpacity onPress={closeDrinkSheet}>
								<Ionicons name="close" size={22} color={T.textMuted} />
							</TouchableOpacity>
						</View>
						<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
							{/* Existing options */}
							{(drinkSheetItem?.drinkOptions ?? []).length === 0 ? (
								<Text style={[styles.drinkEmpty, { color: T.textMuted }]}>No drink options yet. Add one below.</Text>
							) : (
								(drinkSheetItem?.drinkOptions ?? []).map(opt => (
									<View key={opt.id} style={[styles.drinkRow, { borderColor: T.border }]}>
										<View style={{ flex: 1 }}>
											<Text style={[styles.drinkName, { color: T.text }]}>{opt.name}</Text>
											<Text style={[styles.drinkPrice, { color: T.primary }]}>₦{opt.price.toLocaleString()}</Text>
										</View>
										<Switch
											value={opt.isAvailable}
											onValueChange={() => { if (drinkSheetItem) handleToggleDrink(drinkSheetItem, opt); }}
											trackColor={{ false: T.border, true: T.primary }}
											thumbColor="#fff"
											style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
										/>
										<TouchableOpacity
											onPress={() => drinkSheetItem && handleDeleteDrink(drinkSheetItem, opt)}
											hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
											style={{ marginLeft: 8 }}
										>
											<Ionicons name="trash-outline" size={18} color="#E23B3B" />
										</TouchableOpacity>
									</View>
								))
							)}

							{/* Add new drink form */}
							<View style={[styles.drinkAddBox, { borderColor: T.border, backgroundColor: T.bg }]}>
								<Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 0 }]}>Add a Drink Option</Text>
								<TextInput
									value={drinkName}
									onChangeText={setDrinkName}
									placeholder="e.g. Can of Coke"
									placeholderTextColor={T.textMuted}
									style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, marginBottom: 8 }]}
								/>
								<TextInput
									value={drinkPrice}
									onChangeText={setDrinkPrice}
									placeholder="Price (₦)"
									placeholderTextColor={T.textMuted}
									keyboardType="numeric"
									style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
								/>
								<TouchableOpacity
									onPress={handleAddDrink}
									disabled={drinkSaving}
									style={[styles.saveBtn, { backgroundColor: drinkSaving ? T.textMuted : T.primary, marginTop: 12 }]}
									activeOpacity={0.8}
								>
									{drinkSaving
										? <ActivityIndicator color="#fff" />
										: <Text style={styles.saveBtnText}>Add Drink</Text>
									}
								</TouchableOpacity>
							</View>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>
			</Modal>

			{/* Add / Edit sheet */}
			<Modal
				visible={sheetVisible}
				animationType="slide"
				transparent
				onRequestClose={closeSheet}
			>
				<Pressable style={styles.backdrop} onPress={closeSheet} />
				<KeyboardAvoidingView
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					style={styles.sheetWrap}
				>
					<View
						style={[
							styles.sheet,
							{ backgroundColor: T.surface, borderColor: T.border },
						]}
					>
						{/* Sheet header */}
						<View style={[styles.sheetHeader, { borderBottomColor: T.border }]}>
							<Text style={[styles.sheetTitle, { color: T.text }]}>
								{editing ? 'Edit Item' : 'New Item'}
							</Text>
							<TouchableOpacity onPress={closeSheet}>
								<Ionicons name="close" size={22} color={T.textMuted} />
							</TouchableOpacity>
						</View>

						<ScrollView
							contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps="handled"
						>
							{/* Image picker */}
							<TouchableOpacity
								onPress={pickImage}
								style={[
									styles.imagePicker,
									{ backgroundColor: T.bg, borderColor: T.border },
								]}
							>
								{form.image ? (
									<Image
										source={{ uri: form.image }}
										style={styles.imagePreview}
										resizeMode="cover"
									/>
								) : (
									<View style={{ alignItems: 'center', gap: 4 }}>
										<Ionicons
											name="camera-outline"
											size={28}
											color={T.textMuted}
										/>
										<Text
											style={[styles.imagePickerText, { color: T.textMuted }]}
										>
											Tap to add photo
										</Text>
									</View>
								)}
							</TouchableOpacity>

							<FormField
								label="Item Name *"
								value={form.name}
								onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
								placeholder="e.g. Jollof Rice"
								T={T}
							/>
							<FormField
								label="Description"
								value={form.description}
								onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
								placeholder="Optional"
								multiline
								T={T}
							/>
							<FormField
								label="Price (₦) *"
								value={form.price}
								onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
								placeholder="e.g. 2500"
								keyboardType="numeric"
								T={T}
							/>

							{/* Category picker */}
							<Text style={[styles.fieldLabel, { color: T.textSec }]}>
								Category
							</Text>
							<TouchableOpacity
								onPress={() => setCatOpen((o) => !o)}
								style={[
									styles.catTrigger,
									{ backgroundColor: T.bg, borderColor: T.border },
								]}
							>
								<Text
									style={[
										styles.catTriggerText,
										{ color: form.category ? T.text : T.textMuted },
									]}
								>
									{form.category || 'Select category'}
								</Text>
								<Ionicons
									name={catOpen ? 'chevron-up' : 'chevron-down'}
									size={14}
									color={T.textMuted}
								/>
							</TouchableOpacity>
							{catOpen && (
								<View
									style={[
										styles.catDropdown,
										{ backgroundColor: T.surface, borderColor: T.border },
									]}
								>
									{CATEGORIES.map((cat) => (
										<TouchableOpacity
											key={cat}
											onPress={() => {
												setForm((f) => ({ ...f, category: cat }));
												setCatOpen(false);
											}}
											style={[
												styles.catOption,
												{ borderBottomColor: T.border },
											]}
										>
											<Text
												style={[
													styles.catOptionText,
													{ color: form.category === cat ? T.primary : T.text },
												]}
											>
												{cat}
											</Text>
											{form.category === cat && (
												<Ionicons
													name="checkmark"
													size={14}
													color={T.primary}
												/>
											)}
										</TouchableOpacity>
									))}
								</View>
							)}

							{/* Toggles */}
							<View style={[styles.toggleRow, { borderColor: T.border }]}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleLabel, { color: T.text }]}>
										Available
									</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>
										Customers can order this item
									</Text>
								</View>
								<Switch
									value={form.isAvailable}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, isAvailable: v }))
									}
									trackColor={{ false: T.border, true: T.primary }}
									thumbColor="#fff"
								/>
							</View>
							<View
								style={[
									styles.toggleRow,
									{ borderColor: T.border, borderTopWidth: 0 },
								]}
							>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleLabel, { color: T.text }]}>
										Featured
									</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>
										Show at top of your menu
									</Text>
								</View>
								<Switch
									value={form.isFeatured}
									onValueChange={(v) =>
										setForm((f) => ({ ...f, isFeatured: v }))
									}
									trackColor={{ false: T.border, true: T.primary }}
									thumbColor="#fff"
								/>
							</View>

							{/* Save button */}
							<TouchableOpacity
								onPress={handleSave}
								disabled={saving}
								style={[
									styles.saveBtn,
									{ backgroundColor: saving ? T.textMuted : T.primary },
								]}
								activeOpacity={0.8}
							>
								{saving ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.saveBtnText}>
										{editing ? 'Save Changes' : 'Add Item'}
									</Text>
								)}
							</TouchableOpacity>
						</ScrollView>
					</View>
				</KeyboardAvoidingView>
			</Modal>
		</View>
	);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ItemCard({
	item,
	T,
	onEdit,
	onDelete,
	onToggle,
	onDrinks,
}: {
	item: MenuItem;
	T: any;
	onEdit: () => void;
	onDelete: () => void;
	onToggle: () => void;
	onDrinks: () => void;
}) {
	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: T.surface, borderColor: T.border },
			]}
		>
			{item.image ? (
				<Image
					source={{ uri: item.image }}
					style={styles.cardImage}
					resizeMode="cover"
				/>
			) : (
				<View style={[styles.cardImagePlaceholder, { backgroundColor: T.bg }]}>
					<Ionicons name="restaurant-outline" size={28} color={T.textMuted} />
				</View>
			)}
			<View style={{ flex: 1, paddingLeft: 12 }}>
				<View
					style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
				>
					<Text
						style={[styles.cardName, { color: T.text, flex: 1 }]}
						numberOfLines={1}
					>
						{item.name}
					</Text>
					{item.isFeatured && (
						<View
							style={[
								styles.featuredPill,
								{ backgroundColor: `${T.primary}18` },
							]}
						>
							<Text style={[styles.featuredPillText, { color: T.primary }]}>
								Featured
							</Text>
						</View>
					)}
				</View>
				{item.category && (
					<Text style={[styles.cardCat, { color: T.textSec }]}>
						{item.category}
					</Text>
				)}
				<Text style={[styles.cardPrice, { color: T.primary }]}>
					{formatPrice(item.price)}
				</Text>
				<View style={styles.cardFooter}>
					<Switch
						value={item.isAvailable}
						onValueChange={onToggle}
						trackColor={{ false: T.border, true: T.primary }}
						thumbColor="#fff"
						style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
					/>
					<Text
						style={[
							styles.availText,
							{ color: item.isAvailable ? T.primary : T.textMuted },
						]}
					>
						{item.isAvailable ? 'Available' : 'Unavailable'}
					</Text>
					<View style={{ flex: 1 }} />
					<TouchableOpacity
						onPress={onDrinks}
						style={styles.iconBtn}
						hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
					>
						<Ionicons name="water-outline" size={18} color={item.drinkOptions.length > 0 ? T.primary : T.textSec} />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onEdit}
						style={styles.iconBtn}
						hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
					>
						<Ionicons name="create-outline" size={18} color={T.textSec} />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onDelete}
						style={styles.iconBtn}
						hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
					>
						<Ionicons name="trash-outline" size={18} color="#E23B3B" />
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
}

function FormField({
	label,
	value,
	onChangeText,
	placeholder,
	multiline,
	keyboardType,
	T,
}: {
	label: string;
	value: string;
	onChangeText: (v: string) => void;
	placeholder?: string;
	multiline?: boolean;
	keyboardType?: any;
	T: any;
}) {
	return (
		<>
			<Text style={[styles.fieldLabel, { color: T.textSec }]}>{label}</Text>
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={T.textMuted}
				multiline={multiline}
				keyboardType={keyboardType ?? 'default'}
				style={[
					styles.input,
					{ backgroundColor: T.bg, borderColor: T.border, color: T.text },
					multiline && { height: 72, textAlignVertical: 'top' },
				]}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	headerRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingBottom: 12,
		borderBottomWidth: 1,
	},
	iconBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pageTitle: { fontSize: 18, fontWeight: '800' },
	addBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		borderRadius: 4,
		paddingVertical: 7,
		paddingHorizontal: 12,
	},
	addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
	emptyTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
	emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
	card: {
		flexDirection: 'row',
		borderRadius: 4,
		borderWidth: 1,
		marginBottom: 12,
		padding: 12,
		alignItems: 'flex-start',
	},
	cardImage: { width: 72, height: 72, borderRadius: 4 },
	cardImagePlaceholder: {
		width: 72,
		height: 72,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cardName: { fontSize: 14, fontWeight: '700' },
	cardCat: { fontSize: 11, marginTop: 2 },
	cardPrice: { fontSize: 14, fontWeight: '800', marginTop: 4 },
	cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
	availText: { fontSize: 11, fontWeight: '600', marginLeft: -4 },
	featuredPill: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
	featuredPillText: { fontSize: 10, fontWeight: '700' },
	backdrop: { flex: 1 },
	sheetWrap: {
		position: 'absolute',
		bottom: 0,
		left: 0,
		right: 0,
		maxHeight: '90%',
	},
	sheet: {
		flex: 1,
		borderTopLeftRadius: 12,
		borderTopRightRadius: 12,
		borderWidth: 1,
		borderBottomWidth: 0,
		overflow: 'hidden',
	},
	sheetHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: 16,
		borderBottomWidth: 1,
	},
	sheetTitle: { fontSize: 16, fontWeight: '800' },
	imagePicker: {
		height: 120,
		borderRadius: 4,
		borderWidth: 1,
		borderStyle: 'dashed',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 16,
		overflow: 'hidden',
	},
	imagePreview: { width: '100%', height: '100%' },
	imagePickerText: { fontSize: 12 },
	fieldLabel: {
		fontSize: 12,
		fontWeight: '600',
		marginBottom: 6,
		marginTop: 12,
	},
	input: {
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
	},
	catTrigger: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		borderRadius: 4,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	catTriggerText: { fontSize: 14 },
	catDropdown: {
		borderRadius: 4,
		borderWidth: 1,
		marginTop: 2,
		overflow: 'hidden',
	},
	catOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 12,
		paddingVertical: 11,
		borderBottomWidth: 1,
	},
	catOptionText: { fontSize: 14 },
	toggleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderWidth: 1,
		borderRadius: 4,
		marginTop: 12,
	},
	toggleLabel: { fontSize: 14, fontWeight: '600' },
	toggleSub: { fontSize: 11, marginTop: 2 },
	saveBtn: {
		borderRadius: 4,
		paddingVertical: 14,
		alignItems: 'center',
		marginTop: 20,
	},
	saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
	drinkEmpty:  { fontSize: 13, textAlign: 'center', marginBottom: 16, marginTop: 4 },
	drinkRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
	drinkName:   { fontSize: 14, fontWeight: '600' },
	drinkPrice:  { fontSize: 12, fontWeight: '700', marginTop: 2 },
	drinkAddBox: { borderRadius: 4, borderWidth: 1, padding: 12, marginTop: 16 },
});
