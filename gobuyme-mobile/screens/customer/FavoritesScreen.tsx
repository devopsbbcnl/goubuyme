import React, { useCallback, useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Image,
	ActivityIndicator,
	Alert,
	RefreshControl,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomNav } from '@/components/layout/BottomNav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

type FavoriteVendor = {
	id: string;
	businessName: string;
	category: string;
	rating: number;
	logo: string | null;
	isOpen: boolean;
};

export default function FavoritesScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [saved, setSaved] = useState<FavoriteVendor[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [removingId, setRemovingId] = useState<string | null>(null);

	const fetchFavorites = useCallback(async (showSpinner = true) => {
		if (showSpinner) setLoading(true);
		try {
			const res = await api.get('/favorites');
			setSaved(res.data.data ?? []);
		} catch (err: any) {
			Alert.alert(
				'Could not load favorites',
				err?.response?.data?.message ?? 'Pull down to try again.',
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchFavorites();
		}, [fetchFavorites]),
	);

	const handleRefresh = useCallback(() => {
		setRefreshing(true);
		fetchFavorites(false);
	}, [fetchFavorites]);

	const removeFavorite = useCallback(async (vendorId: string) => {
		if (removingId) return;

		const previous = saved;
		setRemovingId(vendorId);
		setSaved(current => current.filter(v => v.id !== vendorId));
		try {
			await api.delete(`/favorites/${vendorId}`);
		} catch (err: any) {
			setSaved(previous);
			Alert.alert(
				'Could not remove favorite',
				err?.response?.data?.message ?? 'Please try again.',
			);
		} finally {
			setRemovingId(null);
		}
	}, [removingId, saved]);

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<Text style={[styles.pageTitle, { color: T.text, paddingTop: insets.top + 16 }]}>
				Favorites
			</Text>

			<ScrollView
				contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
				showsVerticalScrollIndicator={false}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						tintColor={T.primary}
						colors={[T.primary]}
					/>
				}
			>
				{loading ? (
					<View style={styles.loading}>
						<ActivityIndicator color={T.primary} />
					</View>
				) : saved.length === 0 ? (
					<View style={styles.empty}>
						<MaterialIcons
							name="favorite-outline"
							size={48}
							color={T.textMuted}
						/>
						<Text style={[styles.emptyTitle, { color: T.text }]}>
							No saved restaurants
						</Text>
						<Text style={[styles.emptySub, { color: T.textSec }]}>
							Tap the heart on any restaurant to save it here
						</Text>
					</View>
				) : (
					saved.map((v, i) => (
						<TouchableOpacity
							key={v.id}
							onPress={() =>
								router.push({ pathname: '/vendor/[id]', params: { id: v.id } })
							}
							style={[
								styles.row,
								{
									borderBottomColor: T.border,
									borderBottomWidth: i < saved.length - 1 ? 1 : 0,
								},
							]}
							activeOpacity={0.7}
						>
							<View style={styles.thumb}>
								{v.logo ? (
									<Image
										source={{ uri: v.logo }}
										style={{ width: '100%', height: '100%' }}
									/>
								) : (
									<View style={[styles.logoFallback, { backgroundColor: T.primaryTint }]}>
										<MaterialIcons name="restaurant" size={26} color={T.primary} />
									</View>
								)}
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[styles.name, { color: T.text }]}>{v.businessName}</Text>
								<Text style={[styles.meta, { color: T.textSec }]}>
									{v.category} - {v.isOpen ? 'Open' : 'Closed'}
								</Text>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										gap: 4,
										marginTop: 4,
									}}
								>
									<MaterialIcons name="star" size={12} color={T.star} />
									<Text style={[styles.rating, { color: T.text }]}>
										{v.rating.toFixed(1)}
									</Text>
								</View>
							</View>
							<TouchableOpacity
								onPress={() => removeFavorite(v.id)}
								disabled={removingId === v.id}
								style={removingId === v.id ? { opacity: 0.6 } : undefined}
								accessibilityRole="button"
								accessibilityLabel={`Remove ${v.businessName} from favorites`}
							>
								<MaterialIcons name="favorite" size={22} color={T.primary} />
							</TouchableOpacity>
						</TouchableOpacity>
					))
				)}
			</ScrollView>

			<BottomNav
				active="favorites"
				onPress={(tab) => {
					if (tab === 'home') router.replace('/(customer)');
					if (tab === 'orders') router.push('/orders');
					if (tab === 'profile') router.push('/profile');
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	pageTitle: {
		fontSize: 22,
		fontWeight: '800',
		paddingHorizontal: 20,
		paddingBottom: 16,
	},
	loading: { alignItems: 'center', paddingTop: 90 },
	empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
	emptyTitle: { fontSize: 17, fontWeight: '700' },
	emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		paddingVertical: 14,
	},
	thumb: {
		width: 64,
		height: 64,
		borderRadius: 4,
		overflow: 'hidden',
		flexShrink: 0,
	},
	logoFallback: {
		width: '100%',
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center',
	},
	name: { fontSize: 14, fontWeight: '700' },
	meta: { fontSize: 12, marginTop: 2 },
	rating: { fontSize: 12, fontWeight: '600' },
});
