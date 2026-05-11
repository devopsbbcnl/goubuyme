import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Image,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BottomNav } from '@/components/layout/BottomNav';

type FavoriteVendor = {
	id: number;
	name: string;
	cat: string;
	rating: number;
	time: string;
	logo: string;
};

export default function FavoritesScreen() {
	const { theme: T } = useTheme();
	const [saved] = useState<FavoriteVendor[]>([]);

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<Text style={[styles.pageTitle, { color: T.text, paddingTop: 16 }]}>
				Favorites
			</Text>

			<ScrollView
				contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
				showsVerticalScrollIndicator={false}
			>
				{saved.length === 0 ? (
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
								<Image
									source={{ uri: v.logo }}
									style={{ width: '100%', height: '100%' }}
								/>
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[styles.name, { color: T.text }]}>{v.name}</Text>
								<Text style={[styles.meta, { color: T.textSec }]}>
									{v.cat} · {v.time} min
								</Text>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										gap: 4,
										marginTop: 4,
									}}
								>
									<Text style={{ fontSize: 12, color: T.star }}>⭐</Text>
									<Text style={[styles.rating, { color: T.text }]}>
										{v.rating}
									</Text>
								</View>
							</View>
							<TouchableOpacity>
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
	name: { fontSize: 14, fontWeight: '700' },
	meta: { fontSize: 12, marginTop: 2 },
	rating: { fontSize: 12, fontWeight: '600' },
});
