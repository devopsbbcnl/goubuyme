import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	TextInput,
	Image,
	ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomNav } from '@/components/layout/BottomNav';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Vendor {
	id: string;
	businessName: string;
	category: string;
	rating: number;
	totalRatings: number;
	logo: string | null;
	coverImage: string | null;
	isOpen: boolean;
	distanceKm: number | null;
	estimatedMinutes: number | null;
	minOrderPrice: number;
}

function formatTime(mins: number | null): string {
	if (mins === null) return 'Varies';
	return `${mins}–${mins + 10} min`;
}

export default function SearchScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState('');
	const [vendors, setVendors] = useState<Vendor[]>([]);
	const [loading, setLoading] = useState(true);
	const inputRef = useRef<TextInput>(null);

	const fetchVendors = useCallback(async () => {
		try {
			const res = await api.get('/vendors');
			setVendors(res.data.data ?? []);
		} catch {
			// show whatever we have
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { fetchVendors(); }, [fetchVendors]);

	const filtered = vendors.filter(
		(v) =>
			!query ||
			v.businessName.toLowerCase().includes(query.toLowerCase()) ||
			v.category.toLowerCase().includes(query.toLowerCase()),
	);

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<View style={[styles.searchHeader, { paddingTop: insets.top + 16 }]}>
				<View style={[styles.searchField, { backgroundColor: T.surface, borderColor: T.border }]}>
					<Ionicons name="search-outline" size={16} color={T.textMuted} />
					<TextInput
						ref={inputRef}
						value={query}
						onChangeText={setQuery}
						placeholder="Search food, restaurant..."
						placeholderTextColor={T.textMuted}
						style={[styles.searchInput, { color: T.text }]}
						autoFocus
					/>
					{query.length > 0 && (
						<TouchableOpacity onPress={() => setQuery('')}>
							<Ionicons name="close-circle" size={16} color={T.textMuted} />
						</TouchableOpacity>
					)}
				</View>
			</View>

			{loading ? (
				<ActivityIndicator color={T.primary} style={{ marginTop: 40 }} />
			) : (
				<ScrollView
					contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 100 }}
					showsVerticalScrollIndicator={false}
				>
					{!query && (
						<Text style={[styles.sectionLabel, { color: T.textSec }]}>
							All Restaurants
						</Text>
					)}

					{filtered.map((v, i) => (
						<TouchableOpacity
							key={v.id}
							onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: v.id } })}
							style={[
								styles.resultRow,
								{ borderBottomColor: T.border, borderBottomWidth: i < filtered.length - 1 ? 1 : 0 },
							]}
							activeOpacity={0.7}
						>
							<View style={styles.resultImg}>
								{v.logo ? (
									<Image source={{ uri: v.logo }} style={{ width: '100%', height: '100%' }} />
								) : (
									<View style={[styles.resultImg, { backgroundColor: T.surface2, alignItems: 'center', justifyContent: 'center' }]}>
										<Text style={{ fontSize: 22 }}>🍽️</Text>
									</View>
								)}
							</View>
							<View style={{ flex: 1 }}>
								<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
									<Text style={[styles.resultName, { color: T.text }]}>
										{v.businessName}
									</Text>
									{!v.isOpen && (
										<View style={[styles.closedBadge, { backgroundColor: T.surface2 }]}>
											<Text style={[styles.closedText, { color: T.textMuted }]}>Closed</Text>
										</View>
									)}
								</View>
								<Text style={[styles.resultMeta, { color: T.textSec }]}>
									{v.category} · ⚡ {formatTime(v.estimatedMinutes)}
									{v.minOrderPrice > 0 ? ` · Min ₦${v.minOrderPrice.toLocaleString()}` : ''}
								</Text>
							</View>
							<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
								<Ionicons name="star" size={12} color={T.star} />
								<Text style={[styles.resultRating, { color: T.text }]}>
									{v.rating.toFixed(1)}
								</Text>
							</View>
						</TouchableOpacity>
					))}

					{filtered.length === 0 && (
						<View style={{ alignItems: 'center', paddingTop: 40 }}>
							<Text style={{ fontSize: 40 }}>🔍</Text>
							<Text style={{ fontSize: 16, fontWeight: '600', color: T.text, marginTop: 12 }}>
								No results found
							</Text>
							<Text style={{ fontSize: 13, color: T.textSec, marginTop: 6 }}>
								Try a different search term
							</Text>
						</View>
					)}
				</ScrollView>
			)}

			<BottomNav
				onPress={(tab) => {
					if (tab === 'home') router.replace('/(customer)');
					if (tab === 'orders') router.push('/orders');
					if (tab === 'favorites') router.push('/favorites');
					if (tab === 'profile') router.push('/profile');
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	searchHeader: { paddingHorizontal: 20, paddingBottom: 12 },
	searchField: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		borderWidth: 1.5,
		borderRadius: 4,
		paddingVertical: 10,
		paddingHorizontal: 12,
	},
	searchInput:   { flex: 1, fontSize: 14 },
	sectionLabel: {
		fontSize: 13,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
		marginBottom: 12,
		color: '#888',
	},
	resultRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 12,
	},
	resultImg: {
		width: 56,
		height: 56,
		borderRadius: 4,
		overflow: 'hidden',
		flexShrink: 0,
	},
	resultName:   { fontSize: 14, fontWeight: '700' },
	resultMeta:   { fontSize: 12, marginTop: 2 },
	resultRating: { fontSize: 12, fontWeight: '600' },
	closedBadge:  { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
	closedText:   { fontSize: 10, fontWeight: '600' },
});
