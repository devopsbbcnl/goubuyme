import React, { useState } from 'react';
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	TextInput,
	Alert,
	Animated,
	Platform,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ASPECTS = [
	{ id: 'speed', icon: '⚡', label: 'Delivery Speed' },
	{ id: 'vendors', icon: '🍽️', label: 'Vendors & Food' },
	{ id: 'app', icon: '📱', label: 'App Experience' },
	{ id: 'support', icon: '🎧', label: 'Customer Support' },
];

const STORE_LABEL = Platform.OS === 'ios' ? 'App Store' : 'Play Store';

export default function RateAppScreen() {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const [stars, setStars] = useState(0);
	const [aspectRatings, setAspectRatings] = useState<Record<string, number>>(
		{},
	);
	const [review, setReview] = useState('');
	const [submitted, setSubmitted] = useState(false);

	const setAspect = (id: string, val: number) =>
		setAspectRatings((prev) => ({ ...prev, [id]: val }));

	const handleSubmit = () => {
		if (stars === 0) {
			Alert.alert(
				'Please rate us',
				'Tap the stars to give an overall rating before submitting.',
			);
			return;
		}
		setSubmitted(true);
		if (stars >= 4) {
			setTimeout(() => {
				Alert.alert(
					`Love it? Rate on ${STORE_LABEL}`,
					`Your kind review on the ${STORE_LABEL} helps other Nigerians discover GoBuyMe!`,
					[
						{ text: 'Maybe Later', style: 'cancel' },
						{ text: `Open ${STORE_LABEL}`, onPress: () => router.back() },
					],
				);
			}, 600);
		}
	};

	if (submitted) {
		return (
			<View style={{ flex: 1, backgroundColor: T.bg }}>
				<View
					style={[
						styles.header,
						{ borderBottomColor: T.border, paddingTop: 16 },
					]}
				>
					<TouchableOpacity
						onPress={() => router.back()}
						style={styles.backBtn}
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					>
						<Ionicons name="arrow-back" size={22} color={T.text} />
					</TouchableOpacity>
					<Text style={[styles.title, { color: T.text }]}>Rate the App</Text>
					<View style={{ width: 38 }} />
				</View>
				<View style={styles.thankYou}>
					<Text style={{ fontSize: 64 }}>🙏</Text>
					<Text style={[styles.thankTitle, { color: T.text }]}>Thank you!</Text>
					<Text style={[styles.thankSub, { color: T.textSec }]}>
						Your feedback helps us build a better GoBuyMe for everyone.
					</Text>
					<TouchableOpacity
						onPress={() => router.back()}
						style={[styles.doneBtn, { backgroundColor: T.primary }]}
					>
						<Text style={styles.doneBtnText}>Back to Profile</Text>
					</TouchableOpacity>
				</View>
			</View>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			{/* Header */}
			<View
				style={[
					styles.header,
					{ borderBottomColor: T.border },
				]}
			>
				<TouchableOpacity
					onPress={() => router.back()}
					style={styles.backBtn}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.title, { color: T.text }]}>Rate the App</Text>
				<View style={{ width: 38 }} />
			</View>

			<View style={{ flex: 1, padding: 24, gap: 28 }}>
				{/* Overall rating */}
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: T.text }]}>
						Overall Experience
					</Text>
					<Text style={[styles.sectionSub, { color: T.textSec }]}>
						How would you rate GoBuyMe overall?
					</Text>
					<View style={styles.starsRow}>
						{[1, 2, 3, 4, 5].map((n) => (
							<TouchableOpacity
								key={n}
								onPress={() => setStars(n)}
								activeOpacity={0.75}
							>
								<Ionicons
									name={n <= stars ? 'star' : 'star-outline'}
									size={44}
									color={n <= stars ? T.star : T.textMuted}
								/>
							</TouchableOpacity>
						))}
					</View>
					{stars > 0 && (
						<Text style={[styles.starLabel, { color: T.primary }]}>
							{['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][stars]}
						</Text>
					)}
				</View>

				{/* Aspect ratings */}
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: T.text }]}>
						Rate by Category
					</Text>
					<View style={styles.aspects}>
						{ASPECTS.map((a) => (
							<View
								key={a.id}
								style={[
									styles.aspectCard,
									{ backgroundColor: T.surface, borderColor: T.border },
								]}
							>
								<Text style={{ fontSize: 22 }}>{a.icon}</Text>
								<Text style={[styles.aspectLabel, { color: T.text }]}>
									{a.label}
								</Text>
								<View style={styles.miniStars}>
									{[1, 2, 3, 4, 5].map((n) => (
										<TouchableOpacity
											key={n}
											onPress={() => setAspect(a.id, n)}
										>
											<Ionicons
												name={
													n <= (aspectRatings[a.id] ?? 0)
														? 'star'
														: 'star-outline'
												}
												size={18}
												color={
													n <= (aspectRatings[a.id] ?? 0) ? T.star : T.textMuted
												}
											/>
										</TouchableOpacity>
									))}
								</View>
							</View>
						))}
					</View>
				</View>

				{/* Written review */}
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: T.text }]}>
						Tell us more (optional)
					</Text>
					<TextInput
						value={review}
						onChangeText={setReview}
						placeholder="What do you love? What can we improve?"
						placeholderTextColor={T.textMuted}
						multiline
						numberOfLines={4}
						maxLength={500}
						style={[
							styles.reviewInput,
							{
								backgroundColor: T.surface,
								borderColor: T.border,
								color: T.text,
							},
						]}
					/>
					<Text style={[styles.charCount, { color: T.textMuted }]}>
						{review.length}/500
					</Text>
				</View>

				<TouchableOpacity
					onPress={handleSubmit}
					style={[styles.submitBtn, { backgroundColor: T.primary }]}
					activeOpacity={0.85}
				>
					<Text style={styles.submitBtnText}>Submit Feedback</Text>
				</TouchableOpacity>
			</View>
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
		paddingTop: 16,
	},
	backBtn: {
		width: 38,
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	title: { fontSize: 17, fontWeight: '700' },
	section: { gap: 10 },
	sectionTitle: { fontSize: 16, fontWeight: '700' },
	sectionSub: { fontSize: 13 },
	starsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
	starLabel: { fontSize: 16, fontWeight: '700', marginTop: 4 },
	aspects: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
	aspectCard: {
		width: '47%',
		padding: 14,
		borderRadius: 4,
		borderWidth: 1,
		gap: 8,
		alignItems: 'flex-start',
	},
	aspectLabel: { fontSize: 12, fontWeight: '600' },
	miniStars: { flexDirection: 'row', gap: 2 },
	reviewInput: {
		borderRadius: 4,
		borderWidth: 1,
		padding: 12,
		fontSize: 14,
		minHeight: 96,
		textAlignVertical: 'top',
	},
	charCount: { fontSize: 11, textAlign: 'right' },
	submitBtn: {
		height: 52,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
	thankYou: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 14,
		padding: 40,
	},
	thankTitle: { fontSize: 26, fontWeight: '800' },
	thankSub: {
		fontSize: 14,
		textAlign: 'center',
		maxWidth: 260,
		lineHeight: 22,
	},
	doneBtn: {
		marginTop: 12,
		paddingHorizontal: 32,
		paddingVertical: 14,
		borderRadius: 4,
	},
	doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
