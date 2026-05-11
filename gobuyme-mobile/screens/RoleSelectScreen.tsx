import React from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '@/theme';

const ROLES = [
	{
		id: 'customer',
		icon: '🍛',
		label: 'I want to eat',
		sub: 'Order food & more',
	},
	{
		id: 'vendor',
		icon: '🏪',
		label: 'I want to sell',
		sub: 'List your business',
	},
	{
		id: 'rider',
		icon: '🏍️',
		label: 'I want to ride',
		sub: 'Earn on your terms',
	},
];

export default function RoleSelectScreen() {
	const { theme: T } = useTheme();

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: T.bg }}
			contentContainerStyle={styles.container}
		>
			<Text style={[styles.headline, { color: T.text }]}>
				{'How would you\nlike to use GoBuyMe?'}
			</Text>
			<Text style={[styles.sub, { color: T.textSec }]}>
				Pick your role to get started
			</Text>

			<View style={styles.cards}>
				{ROLES.map((r) => (
					<TouchableOpacity
						key={r.id}
						onPress={() =>
							router.push({ pathname: '/register', params: { role: r.id } })
						}
						activeOpacity={0.85}
						style={[
							styles.card,
							{ backgroundColor: T.surface, borderColor: T.border },
						]}
					>
						<View style={[styles.iconBox, { backgroundColor: T.primaryTint }]}>
							<Text style={styles.iconEmoji}>{r.icon}</Text>
						</View>
						<View style={styles.cardText}>
							<Text style={[styles.cardLabel, { color: T.text }]}>
								{r.label}
							</Text>
							<Text style={[styles.cardSub, { color: T.textSec }]}>
								{r.sub}
							</Text>
						</View>
						<Ionicons name="chevron-forward" size={20} color={T.textMuted} />
					</TouchableOpacity>
				))}
			</View>

			<TouchableOpacity
				onPress={() => router.push('/login')}
				style={{ marginTop: 32, alignItems: 'center' }}
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
	container: { padding: 24, paddingTop: 16 },
	headline: {
		fontSize: 30,
		fontWeight: '800',
		lineHeight: 38,
		letterSpacing: -0.5,
		fontFamily: 'PlusJakartaSans_800ExtraBold',
	},
	sub: {
		fontSize: 14,
		marginTop: 8,
		marginBottom: 32,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
	cards: { gap: 12 },
	card: {
		borderWidth: 1,
		borderRadius: radius.md,
		padding: 20,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 16,
	},
	iconBox: {
		width: 56,
		height: 56,
		borderRadius: radius.md,
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconEmoji: { fontSize: 28 },
	cardText: { flex: 1 },
	cardLabel: {
		fontSize: 17,
		fontWeight: '700',
		fontFamily: 'PlusJakartaSans_700Bold',
	},
	cardSub: {
		fontSize: 13,
		marginTop: 2,
		fontFamily: 'PlusJakartaSans_400Regular',
	},
});
