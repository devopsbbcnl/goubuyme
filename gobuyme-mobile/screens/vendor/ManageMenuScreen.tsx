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
	Pressable,
	useWindowDimensions,
} from 'react-native';
import { pickImage as openImagePicker } from '@/utils/pickImage';
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

interface OptionItem {
	id: string;
	name: string;
	extraPrice: number;
	isAvailable: boolean;
}

interface OptionGroup {
	id: string;
	name: string;
	required: boolean;
	items: OptionItem[];
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
	stockQuantity: number;
	drinkOptions: DrinkOption[];
	optionGroups: OptionGroup[];
}

interface FormState {
	name: string;
	description: string;
	price: string;
	category: string;
	image: string | null;
	isAvailable: boolean;
	isFeatured: boolean;
	stockQuantity: string;
}

const EMPTY_FORM: FormState = {
	name: '',
	description: '',
	price: '',
	category: '',
	image: null,
	isAvailable: true,
	isFeatured: false,
	stockQuantity: '',
};

const RESTAURANT_CATS = ['Meals', 'Drinks', 'Snacks', 'Pastries', 'Sides', 'Desserts', 'Specials', 'Other'];

const EMART_CATS = [
	'Alcohol & Cigarettes', 'Snacks', 'Drinks', 'Water', 'Fruits & Vegetables',
	'Food', 'Meat & Chicken', 'Basic Food', 'Dairy & Breakfast', 'Bakery',
	'Ice Cream', 'Fit & Form', 'Home Care', 'Home Life', 'Personal Care',
	'Technology', 'Sexual Health', 'Baby', 'Clothing', 'Stationery', 'Pets',
];

const PHARMACY_CATS = [
	'OTC Medications', 'Vitamins & Supplements', 'Prescription', 'First Aid',
	'Mother & Baby', 'Sexual Health', 'Skincare', 'Dental Care', 'Eye Care',
	'Diagnostics & Monitoring', 'Herbal & Natural', 'Personal Hygiene',
];

function getCatList(vendorCategory: string | null): string[] {
	if (vendorCategory === 'EMART') return EMART_CATS;
	if (vendorCategory === 'PHARMACY') return PHARMACY_CATS;
	return RESTAURANT_CATS;
}

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
		throw new Error('Image upload is not configured. Contact support.');
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
	if (!res.ok) throw new Error('Image upload failed. Please try again.');
	const data = await res.json();
	if (!data.secure_url) throw new Error('Image upload failed. Please try again.');
	return data.secure_url;
}

export default function ManageMenuScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const { height: screenHeight } = useWindowDimensions();

	const [vendorCategory, setVendorCategory] = useState<string | null>(null);
	const [items, setItems] = useState<MenuItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [sheetVisible, setSheetVisible] = useState(false);
	const [editing, setEditing] = useState<MenuItem | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [catOpen, setCatOpen] = useState(false);
	const categoryList = getCatList(vendorCategory);

	// Drink options sheet state
	const [drinkSheetItem, setDrinkSheetItem] = useState<MenuItem | null>(null);
	const [drinkName, setDrinkName] = useState('');
	const [drinkPrice, setDrinkPrice] = useState('');
	const [drinkSaving, setDrinkSaving] = useState(false);

	// Option groups sheet state
	const [optSheetItem, setOptSheetItem] = useState<MenuItem | null>(null);
	const [newGroupName, setNewGroupName] = useState('');
	const [newGroupRequired, setNewGroupRequired] = useState(false);
	const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
	const [newOptName, setNewOptName] = useState('');
	const [newOptPrice, setNewOptPrice] = useState('');
	const [optSaving, setOptSaving] = useState(false);

	// Normalize menu items to ensure arrays are always defined
	const normalizeMenuItem = (item: any): MenuItem => ({
		...item,
		stockQuantity: Number(item?.stockQuantity ?? 0),
		drinkOptions: item.drinkOptions ?? [],
		optionGroups: (item.optionGroups ?? []).map((g: any) => ({
			...g,
			items: g.items ?? [],
		})),
	});

	const fetchItems = useCallback(async () => {
		try {
			const [menuRes, profileRes] = await Promise.all([
				api.get('/vendors/me/menu'),
				api.get('/vendors/me'),
			]);
			const data = (menuRes.data.data ?? []).map(normalizeMenuItem);
			setItems(data);
			setVendorCategory(profileRes.data.data?.category ?? null);
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
			stockQuantity: String(item.stockQuantity ?? 0),
		});
		setCatOpen(false);
		setSheetVisible(true);
	};

	const closeSheet = () => {
		setSheetVisible(false);
		setEditing(null);
	};

	const pickImage = async () => {
		const uri = await openImagePicker({ aspect: [1, 1], quality: 0.8 });
		if (uri) setForm((f) => ({ ...f, image: uri }));
	};

	const handleSave = async () => {
		const name = form.name.trim();
		const price = parseFloat(form.price);
		const stockQuantity = Number(form.stockQuantity);
		if (!name) {
			Alert.alert('Validation', 'Item name is required.');
			return;
		}
		if (!form.price || isNaN(price) || price <= 0) {
			Alert.alert('Validation', 'Enter a valid price greater than 0.');
			return;
		}
		if (!form.stockQuantity.trim() || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
			Alert.alert('Validation', 'Enter a stock quantity of 0 or more.');
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
				stockQuantity,
			};

			if (editing) {
				await api.patch(`/vendors/me/menu/${editing.id}`, payload);
				setItems((prev) =>
					prev.map((it) =>
						it.id === editing.id
							? normalizeMenuItem({ ...it, ...payload, id: editing.id })
							: it,
					),
				);
			} else {
				const res = await api.post('/vendors/me/menu', payload);
				const newItem = normalizeMenuItem(res.data.data);
				setItems((prev) => [newItem, ...prev]);
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

	const openOptSheet = (item: MenuItem) => {
		setOptSheetItem(item);
		setNewGroupName('');
		setNewGroupRequired(false);
		setAddingToGroupId(null);
		setNewOptName('');
		setNewOptPrice('');
	};

	const closeOptSheet = () => setOptSheetItem(null);

	const handleAddOptionGroup = async () => {
		if (!optSheetItem) return;
		const name = newGroupName.trim();
		if (!name) { Alert.alert('Validation', 'Group name is required.'); return; }
		setOptSaving(true);
		try {
			const res = await api.post(`/vendors/me/menu/${optSheetItem.id}/option-groups`, { name, required: newGroupRequired });
			const newGroup: OptionGroup = { ...res.data.data, items: res.data.data.items ?? [] };
			setItems(prev => prev.map(it =>
				it.id === optSheetItem.id ? { ...it, optionGroups: [...it.optionGroups, newGroup] } : it,
			));
			setOptSheetItem(prev => prev ? { ...prev, optionGroups: [...prev.optionGroups, newGroup] } : null);
			setNewGroupName('');
			setNewGroupRequired(false);
		} catch (err: any) {
			Alert.alert('Error', err?.response?.data?.message ?? 'Could not add option group.');
		} finally {
			setOptSaving(false);
		}
	};

	const handleDeleteOptionGroup = (group: OptionGroup) => {
		if (!optSheetItem) return;
		Alert.alert('Remove group', `Remove "${group.name}" and all its options?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Remove', style: 'destructive', onPress: async () => {
					try {
						await api.delete(`/vendors/me/menu/${optSheetItem.id}/option-groups/${group.id}`);
						const remove = (it: MenuItem) => it.id === optSheetItem.id
							? { ...it, optionGroups: it.optionGroups.filter(g => g.id !== group.id) }
							: it;
						setItems(prev => prev.map(remove));
						setOptSheetItem(prev => prev ? { ...prev, optionGroups: prev.optionGroups.filter(g => g.id !== group.id) } : null);
					} catch (err: any) {
						Alert.alert('Error', err?.response?.data?.message ?? 'Could not remove group.');
					}
				},
			},
		]);
	};

	const handleAddOptionItem = async (group: OptionGroup) => {
		if (!optSheetItem) return;
		const name = newOptName.trim();
		const extraPrice = parseFloat(newOptPrice) || 0;
		if (!name) { Alert.alert('Validation', 'Option name is required.'); return; }
		setOptSaving(true);
		try {
			const res = await api.post(`/vendors/me/menu/${optSheetItem.id}/option-groups/${group.id}/items`, { name, extraPrice });
			const newItem: OptionItem = res.data.data;
			const update = (it: MenuItem) => it.id === optSheetItem.id
				? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id ? { ...g, items: [...(g.items ?? []), newItem] } : g) }
				: it;
			setItems(prev => prev.map(update));
			setOptSheetItem(prev => prev ? {
				...prev,
				optionGroups: prev.optionGroups.map(g => g.id === group.id ? { ...g, items: [...(g.items ?? []), newItem] } : g),
			} : null);
			setNewOptName('');
			setNewOptPrice('');
			setAddingToGroupId(null);
		} catch (err: any) {
			Alert.alert('Error', err?.response?.data?.message ?? 'Could not add option.');
		} finally {
			setOptSaving(false);
		}
	};

	const handleToggleOptionItem = async (group: OptionGroup, optItem: OptionItem) => {
		if (!optSheetItem) return;
		const next = !optItem.isAvailable;
		const applyUpdate = (it: MenuItem) => it.id === optSheetItem.id
			? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id
				? { ...g, items: g.items.map(oi => oi.id === optItem.id ? { ...oi, isAvailable: next } : oi) }
				: g) }
			: it;
		setItems(prev => prev.map(applyUpdate));
		setOptSheetItem(prev => prev ? {
			...prev,
			optionGroups: prev.optionGroups.map(g => g.id === group.id
				? { ...g, items: g.items.map(oi => oi.id === optItem.id ? { ...oi, isAvailable: next } : oi) }
				: g),
		} : null);
		try {
			await api.patch(`/vendors/me/menu/${optSheetItem.id}/option-groups/${group.id}/items/${optItem.id}`, { isAvailable: next });
		} catch {
			const revert = (it: MenuItem) => it.id === optSheetItem.id
				? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id
					? { ...g, items: g.items.map(oi => oi.id === optItem.id ? { ...oi, isAvailable: optItem.isAvailable } : oi) }
					: g) }
				: it;
			setItems(prev => prev.map(revert));
			setOptSheetItem(prev => prev ? {
				...prev,
				optionGroups: prev.optionGroups.map(g => g.id === group.id
					? { ...g, items: g.items.map(oi => oi.id === optItem.id ? { ...oi, isAvailable: optItem.isAvailable } : oi) }
					: g),
			} : null);
		}
	};

	const handleDeleteOptionItem = (group: OptionGroup, optItem: OptionItem) => {
		if (!optSheetItem) return;
		Alert.alert('Remove option', `Remove "${optItem.name}"?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Remove', style: 'destructive', onPress: async () => {
					try {
						await api.delete(`/vendors/me/menu/${optSheetItem.id}/option-groups/${group.id}/items/${optItem.id}`);
						const remove = (it: MenuItem) => it.id === optSheetItem.id
							? { ...it, optionGroups: it.optionGroups.map(g => g.id === group.id
								? { ...g, items: g.items.filter(oi => oi.id !== optItem.id) }
								: g) }
							: it;
						setItems(prev => prev.map(remove));
						setOptSheetItem(prev => prev ? {
							...prev,
							optionGroups: prev.optionGroups.map(g => g.id === group.id
								? { ...g, items: g.items.filter(oi => oi.id !== optItem.id) }
								: g),
						} : null);
					} catch (err: any) {
						Alert.alert('Error', err?.response?.data?.message ?? 'Could not remove option.');
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
							onOptions={() => openOptSheet(item)}
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
				<View style={styles.modalBackdrop}>
					<Pressable style={StyleSheet.absoluteFillObject} onPress={closeDrinkSheet} />
					<View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border, height: screenHeight * 0.65 }]}>
						<View style={[styles.sheetHeader, { borderBottomColor: T.border }]}>
							<Text style={[styles.sheetTitle, { color: T.text }]}>Drink Options</Text>
							<TouchableOpacity onPress={closeDrinkSheet}>
								<Ionicons name="close" size={22} color={T.textMuted} />
							</TouchableOpacity>
						</View>
						<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
				</View>
			</Modal>

			{/* Option groups sheet */}
			<Modal
				visible={!!optSheetItem}
				animationType="slide"
				transparent
				onRequestClose={closeOptSheet}
			>
				<View style={styles.modalBackdrop}>
					<Pressable style={StyleSheet.absoluteFillObject} onPress={closeOptSheet} />
					<View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border, height: screenHeight * 0.88 }]}>
						<View style={[styles.sheetHeader, { borderBottomColor: T.border }]}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.sheetTitle, { color: T.text }]}>Add-on Options</Text>
								{optSheetItem && <Text style={[styles.drinkPrice, { color: T.textSec }]}>{optSheetItem.name}</Text>}
							</View>
							<TouchableOpacity onPress={closeOptSheet}>
								<Ionicons name="close" size={22} color={T.textMuted} />
							</TouchableOpacity>
						</View>
						<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
							{(optSheetItem?.optionGroups ?? []).length === 0 && (
								<Text style={[styles.drinkEmpty, { color: T.textMuted }]}>No option groups yet. Add one below.</Text>
							)}
							{(optSheetItem?.optionGroups ?? []).map(group => (
								<View key={group.id} style={[styles.optGroupBox, { borderColor: T.border, backgroundColor: T.bg }]}>
									<View style={styles.optGroupHeader}>
										<View style={{ flex: 1 }}>
											<Text style={[styles.optGroupName, { color: T.text }]}>{group.name}</Text>
											{group.required && (
												<View style={[styles.requiredPill, { backgroundColor: `${T.primary}18` }]}>
													<Text style={[styles.requiredPillText, { color: T.primary }]}>Required</Text>
												</View>
											)}
										</View>
										<TouchableOpacity
											onPress={() => handleDeleteOptionGroup(group)}
											hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
										>
											<Ionicons name="trash-outline" size={16} color="#E23B3B" />
										</TouchableOpacity>
									</View>
									{group.items.map(optItem => (
										<View key={optItem.id} style={[styles.optItemRow, { borderTopColor: T.border }]}>
											<View style={{ flex: 1 }}>
												<Text style={[styles.drinkName, { color: T.text }]}>{optItem.name}</Text>
												{optItem.extraPrice > 0 && (
													<Text style={[styles.drinkPrice, { color: T.primary }]}>+₦{optItem.extraPrice.toLocaleString()}</Text>
												)}
											</View>
											<Switch
												value={optItem.isAvailable}
												onValueChange={() => { if (optSheetItem) handleToggleOptionItem(group, optItem); }}
												trackColor={{ false: T.border, true: T.primary }}
												thumbColor="#fff"
												style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
											/>
											<TouchableOpacity
												onPress={() => optSheetItem && handleDeleteOptionItem(group, optItem)}
												hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
												style={{ marginLeft: 8 }}
											>
												<Ionicons name="trash-outline" size={16} color="#E23B3B" />
											</TouchableOpacity>
										</View>
									))}
									{addingToGroupId === group.id ? (
										<View style={[styles.optAddItemBox, { borderTopColor: T.border }]}>
											<TextInput
												value={newOptName}
												onChangeText={setNewOptName}
												placeholder="Option name (e.g. Semo)"
												placeholderTextColor={T.textMuted}
												style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, marginBottom: 8 }]}
											/>
											<TextInput
												value={newOptPrice}
												onChangeText={setNewOptPrice}
												placeholder="Extra price ₦ (0 if none)"
												placeholderTextColor={T.textMuted}
												keyboardType="numeric"
												style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text }]}
											/>
											<View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
												<TouchableOpacity
													onPress={() => { setAddingToGroupId(null); setNewOptName(''); setNewOptPrice(''); }}
													style={[styles.optCancelBtn, { borderColor: T.border }]}
												>
													<Text style={[styles.optCancelBtnText, { color: T.textSec }]}>Cancel</Text>
												</TouchableOpacity>
												<TouchableOpacity
													onPress={() => handleAddOptionItem(group)}
													disabled={optSaving}
													style={[styles.optAddBtn, { backgroundColor: optSaving ? T.textMuted : T.primary, flex: 1 }]}
													activeOpacity={0.8}
												>
													{optSaving
														? <ActivityIndicator color="#fff" size="small" />
														: <Text style={styles.saveBtnText}>Add Option</Text>
													}
												</TouchableOpacity>
											</View>
										</View>
									) : (
										<TouchableOpacity
											onPress={() => { setAddingToGroupId(group.id); setNewOptName(''); setNewOptPrice(''); }}
											style={[styles.optAddItemTrigger, { borderTopColor: T.border }]}
										>
											<Ionicons name="add-circle-outline" size={16} color={T.primary} />
											<Text style={[styles.optAddItemTriggerText, { color: T.primary }]}>Add option</Text>
										</TouchableOpacity>
									)}
								</View>
							))}
							<View style={[styles.drinkAddBox, { borderColor: T.border, backgroundColor: T.bg, marginTop: 8 }]}>
								<Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 0 }]}>Add Option Group</Text>
								<TextInput
									value={newGroupName}
									onChangeText={setNewGroupName}
									placeholder="e.g. Choice of Swallow"
									placeholderTextColor={T.textMuted}
									style={[styles.input, { backgroundColor: T.surface, borderColor: T.border, color: T.text, marginBottom: 8 }]}
								/>
								<View style={[styles.toggleRow, { borderColor: T.border, marginTop: 0 }]}>
									<View style={{ flex: 1 }}>
										<Text style={[styles.toggleLabel, { color: T.text }]}>Required</Text>
										<Text style={[styles.toggleSub, { color: T.textSec }]}>Customer must choose one</Text>
									</View>
									<Switch
										value={newGroupRequired}
										onValueChange={setNewGroupRequired}
										trackColor={{ false: T.border, true: T.primary }}
										thumbColor="#fff"
									/>
								</View>
								<TouchableOpacity
									onPress={handleAddOptionGroup}
									disabled={optSaving}
									style={[styles.saveBtn, { backgroundColor: optSaving ? T.textMuted : T.primary, marginTop: 12 }]}
									activeOpacity={0.8}
								>
									{optSaving
										? <ActivityIndicator color="#fff" />
										: <Text style={styles.saveBtnText}>Add Group</Text>
									}
								</TouchableOpacity>
							</View>
						</ScrollView>
					</View>
				</View>
			</Modal>

			{/* Add / Edit sheet */}
			<Modal
				visible={sheetVisible}
				animationType="slide"
				transparent
				onRequestClose={closeSheet}
			>
				<View style={styles.modalBackdrop}>
					<Pressable style={StyleSheet.absoluteFillObject} onPress={closeSheet} />
					<View style={[styles.sheet, { backgroundColor: T.surface, borderColor: T.border, height: screenHeight * 0.88 }]}>
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
							style={{ flex: 1 }}
							contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps="handled"
						>
							{/* Image picker */}
							<TouchableOpacity
								onPress={pickImage}
								style={[styles.imagePicker, { backgroundColor: T.bg, borderColor: T.border }]}
							>
								{form.image ? (
									<Image source={{ uri: form.image }} style={styles.imagePreview} resizeMode="cover" />
								) : (
									<View style={{ alignItems: 'center', gap: 4 }}>
										<Ionicons name="camera-outline" size={28} color={T.textMuted} />
										<Text style={[styles.imagePickerText, { color: T.textMuted }]}>
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

							<FormField
								label="Stock Quantity *"
								value={form.stockQuantity}
								onChangeText={(v) => setForm((f) => ({ ...f, stockQuantity: v.replace(/[^0-9]/g, '') }))}
								placeholder="e.g. 20"
								keyboardType="number-pad"
								T={T}
							/>

							{/* Category picker */}
							<Text style={[styles.fieldLabel, { color: T.textSec }]}>Category</Text>
							<TouchableOpacity
								onPress={() => setCatOpen((o) => !o)}
								style={[styles.catTrigger, { backgroundColor: T.bg, borderColor: T.border }]}
							>
								<Text style={[styles.catTriggerText, { color: form.category ? T.text : T.textMuted }]}>
									{form.category || 'Select category'}
								</Text>
								<Ionicons name={catOpen ? 'chevron-up' : 'chevron-down'} size={14} color={T.textMuted} />
							</TouchableOpacity>
							{catOpen && (
								<View style={[styles.catDropdown, { backgroundColor: T.surface, borderColor: T.border }]}>
									{categoryList.map((cat) => (
										<TouchableOpacity
											key={cat}
											onPress={() => { setForm((f) => ({ ...f, category: cat })); setCatOpen(false); }}
											style={[styles.catOption, { borderBottomColor: T.border }]}
										>
											<Text style={[styles.catOptionText, { color: form.category === cat ? T.primary : T.text }]}>
												{cat}
											</Text>
											{form.category === cat && <Ionicons name="checkmark" size={14} color={T.primary} />}
										</TouchableOpacity>
									))}
								</View>
							)}

							{/* Toggles */}
							<View style={[styles.toggleRow, { borderColor: T.border }]}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleLabel, { color: T.text }]}>Available</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>Customers can order this item</Text>
								</View>
								<Switch
									value={form.isAvailable}
									onValueChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))}
									trackColor={{ false: T.border, true: T.primary }}
									thumbColor="#fff"
								/>
							</View>
							<View style={[styles.toggleRow, { borderColor: T.border, borderTopWidth: 0 }]}>
								<View style={{ flex: 1 }}>
									<Text style={[styles.toggleLabel, { color: T.text }]}>Featured</Text>
									<Text style={[styles.toggleSub, { color: T.textSec }]}>Show at top of your menu</Text>
								</View>
								<Switch
									value={form.isFeatured}
									onValueChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
									trackColor={{ false: T.border, true: T.primary }}
									thumbColor="#fff"
								/>
							</View>

							{/* Save button */}
							<TouchableOpacity
								onPress={handleSave}
								disabled={saving}
								style={[styles.saveBtn, { backgroundColor: saving ? T.textMuted : T.primary }]}
								activeOpacity={0.8}
							>
								{saving ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.saveBtnText}>{editing ? 'Save Changes' : 'Add Item'}</Text>
								)}
							</TouchableOpacity>
						</ScrollView>
					</View>
				</View>
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
	onOptions,
}: {
	item: MenuItem;
	T: any;
	onEdit: () => void;
	onDelete: () => void;
	onToggle: () => void;
	onDrinks: () => void;
	onOptions: () => void;
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
				<Text style={[styles.stockText, { color: item.stockQuantity > 0 ? T.textSec : '#E23B3B' }]}>
					{item.stockQuantity > 0 ? `${item.stockQuantity} in stock` : 'Out of stock'}
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
						<Ionicons name="water-outline" size={18} color={(item.drinkOptions ?? []).length > 0 ? T.primary : T.textSec} />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onOptions}
						style={styles.iconBtn}
						hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
					>
						<Ionicons name="options-outline" size={18} color={(item.optionGroups ?? []).length > 0 ? T.primary : T.textSec} />
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
	stockText: { fontSize: 11, fontWeight: '600', marginTop: 2 },
	cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
	availText: { fontSize: 11, fontWeight: '600', marginLeft: -4 },
	featuredPill: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
	featuredPillText: { fontSize: 10, fontWeight: '700' },
	modalBackdrop: {
		flex: 1,
		justifyContent: 'flex-end',
		backgroundColor: 'rgba(0,0,0,0.45)',
	},
	sheet: {
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
	optGroupBox:         { borderRadius: 4, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
	optGroupHeader:      { flexDirection: 'row', alignItems: 'center', padding: 12 },
	optGroupName:        { fontSize: 14, fontWeight: '700' },
	requiredPill:        { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginTop: 3, alignSelf: 'flex-start' },
	requiredPillText:    { fontSize: 10, fontWeight: '700' },
	optItemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, gap: 8 },
	optAddItemBox:       { padding: 12, borderTopWidth: 1 },
	optAddItemTrigger:   { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderTopWidth: 1 },
	optAddItemTriggerText: { fontSize: 13, fontWeight: '600' },
	optCancelBtn:        { borderRadius: 4, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
	optCancelBtnText:    { fontSize: 14, fontWeight: '600' },
	optAddBtn:           { borderRadius: 4, paddingVertical: 10, alignItems: 'center' },
});
