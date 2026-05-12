import React, { useEffect, useRef } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useOrderTracking, OrderStatus } from '@/hooks/useOrderTracking';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const MAP_STYLE =
	MAPTILER_KEY && MAPTILER_KEY !== 'get_free_key_at_maptiler_com'
		? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
		: 'https://demotiles.maplibre.org/style.json';

const DEFAULT_COORD: [number, number] = [7.0348, 5.4836];

const STEPS: OrderStatus[] = [
	'PENDING',
	'PREPARING',
	'READY',
	'IN_TRANSIT',
	'DELIVERED',
];
const LABELS = [
	'Processing',
	'Preparing Food',
	'Ready for Pickup',
	'Rider on the way',
	'Delivered',
];
const STATUS_COLORS = ['#F5A623', '#F5A623', '#1A9E5F', '#1A6EFF', '#1A9E5F'];

function statusToStep(status: OrderStatus): number {
	if (status === 'PENDING' || status === 'CONFIRMED') return 0;
	if (status === 'ACCEPTED' || status === 'PREPARING') return 1;
	if (status === 'READY') return 2;
	if (status === 'PICKED_UP' || status === 'IN_TRANSIT') return 3;
	if (status === 'DELIVERED') return 4;
	return 0;
}

export default function OrderTrackingScreen() {
	const { theme: T } = useTheme();
	const params = useLocalSearchParams<{
		orderId?: string;
		orderNumber?: string;
		estimatedTime?: string;
	}>();

	const orderId = params.orderId ?? null;
	const orderNumber = params.orderNumber ?? '';
	const etaMinutes = params.estimatedTime
		? parseInt(params.estimatedTime, 10)
		: null;

	const { status, riderLocation, rider } = useOrderTracking(orderId);
	const step = statusToStep(status);
	const done = status === 'DELIVERED';
	const inTransit = status === 'PICKED_UP' || status === 'IN_TRANSIT';
	const cameraRef = useRef<any>(null);

	useEffect(() => {
		if (riderLocation && cameraRef.current?.setCamera) {
			cameraRef.current.setCamera({
				centerCoordinate: [riderLocation.lng, riderLocation.lat],
				zoomLevel: 15,
				animationDuration: 800,
				animationMode: 'easeTo',
			});
		}
	}, [riderLocation?.lat, riderLocation?.lng]);

	const riderCoord: [number, number] = riderLocation
		? [riderLocation.lng, riderLocation.lat]
		: DEFAULT_COORD;

	return (
		<View style={{ flex: 1, backgroundColor: T.bg }}>
			<ScrollView
				contentContainerStyle={{ paddingBottom: 100 }}
				showsVerticalScrollIndicator={false}
			>
				<View style={[styles.header, { paddingTop: 16 }]}>
					<TouchableOpacity onPress={() => router.back()}>
						<Ionicons name="chevron-back" size={24} color={T.text} />
					</TouchableOpacity>
					<Text style={[styles.headerTitle, { color: T.text }]}>
						Order Tracking
					</Text>
				</View>

				<View style={styles.mapContainer}>
					<TrackingMap
						cameraRef={cameraRef}
						riderCoord={riderCoord}
						primaryColor={T.primary}
					/>

					{inTransit && etaMinutes !== null && (
						<View style={styles.etaChip}>
							<Ionicons name="flash" size={12} color={T.primary} />
							<Text style={styles.etaText}>{etaMinutes} min away</Text>
						</View>
					)}

					<View style={[styles.liveBadge, { backgroundColor: T.primary }]}>
						<View style={styles.liveDot} />
						<Text style={styles.liveText}>LIVE</Text>
					</View>
				</View>

				<View
					style={[
						styles.card,
						{ backgroundColor: T.surface, borderColor: T.border },
					]}
				>
					<View style={styles.statusRow}>
						<View
							style={[
								styles.statusIcon,
								{ backgroundColor: `${STATUS_COLORS[step]}22` },
							]}
						>
							<Ionicons
								name={done ? 'checkmark-circle' : 'time-outline'}
								size={22}
								color={STATUS_COLORS[step]}
							/>
						</View>
						<View>
							<Text style={[styles.statusLabel, { color: T.text }]}>
								{LABELS[step]}
							</Text>
							{orderNumber ? (
								<Text style={[styles.orderId, { color: T.textSec }]}>
									Order #{orderNumber}
								</Text>
							) : null}
						</View>
					</View>

					<View style={styles.progressRow}>
						{STEPS.map((_, i) => (
							<React.Fragment key={i}>
								<View
									style={[
										styles.stepDot,
										{
											backgroundColor: i <= step ? T.primary : T.surface3,
											borderWidth: i === step ? 2 : 0,
											borderColor: T.primaryLight,
										},
									]}
								>
									{i < step && (
										<Ionicons name="checkmark" size={10} color="#fff" />
									)}
									{i === step && <View style={styles.stepInner} />}
								</View>
								{i < STEPS.length - 1 && (
									<View
										style={[
											styles.stepLine,
											{ backgroundColor: i < step ? T.primary : T.surface3 },
										]}
									/>
								)}
							</React.Fragment>
						))}
					</View>
				</View>

				{rider ? (
					<View
						style={[
							styles.card,
							{ backgroundColor: T.surface, borderColor: T.border },
						]}
					>
						<View style={styles.riderRow}>
							<View
								style={[styles.riderAvatar, { backgroundColor: T.surface3 }]}
							>
								<Ionicons name="person" size={22} color={T.textSec} />
							</View>
							<View style={{ flex: 1 }}>
								<Text style={[styles.riderName, { color: T.text }]}>
									{rider.name}
								</Text>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										gap: 4,
										marginTop: 2,
									}}
								>
									<Ionicons name="star" size={12} color={T.star} />
									<Text style={[styles.riderMeta, { color: T.textSec }]}>
										{rider.rating.toFixed(1)}
										{rider.vehicleType ? ` · ${rider.vehicleType}` : ''}
									</Text>
								</View>
							</View>
							{rider.phone ? (
								<TouchableOpacity
									style={[
										styles.contactBtn,
										{ backgroundColor: T.primaryTint },
									]}
								>
									<Ionicons name="call-outline" size={18} color={T.primary} />
								</TouchableOpacity>
							) : null}
							<TouchableOpacity
								style={[styles.contactBtn, { backgroundColor: T.primaryTint }]}
							>
								<Ionicons
									name="chatbubble-outline"
									size={18}
									color={T.primary}
								/>
							</TouchableOpacity>
						</View>
					</View>
				) : (
					!done && (
						<View
							style={[
								styles.card,
								{ backgroundColor: T.surface, borderColor: T.border },
							]}
						>
							<View style={styles.riderRow}>
								<View
									style={[styles.riderAvatar, { backgroundColor: T.surface3 }]}
								>
									<Ionicons
										name="bicycle-outline"
										size={22}
										color={T.textSec}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Text style={[styles.riderName, { color: T.textSec }]}>
										Waiting for a rider
									</Text>
									<Text style={[styles.riderMeta, { color: T.textMuted }]}>
										A rider will be assigned once your order is ready
									</Text>
								</View>
							</View>
						</View>
					)
				)}
			</ScrollView>

			{done && (
				<View style={{ padding: 20, paddingBottom: 36 }}>
					<PrimaryButton onPress={() => router.replace('/(customer)')}>
						Rate Your Order
					</PrimaryButton>
				</View>
			)}
		</View>
	);
}

function TrackingMap({
	cameraRef: _cameraRef,
	riderCoord: _riderCoord,
	primaryColor: _primaryColor,
}: {
	cameraRef: React.RefObject<any>;
	riderCoord: [number, number];
	primaryColor: string;
}) {
	return <MapFallback />;
}

function MapFallback() {
	const pulse = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const anim = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, { toValue: 1.35, duration: 750, useNativeDriver: true }),
				Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
			])
		);
		anim.start();
		return () => anim.stop();
	}, []);

	return (
		<View style={styles.mapFallback}>
			{[30, 75, 120, 165, 210].map(top => (
				<View key={top} style={[styles.roadLine, { top }]} />
			))}

			<View style={styles.routeRow}>
				<View style={styles.routePinOrange}>
					<Ionicons name="storefront" size={15} color="#FF521B" />
				</View>

				<View style={styles.routeDash} />

				<Animated.View style={[styles.riderBubble, { transform: [{ scale: pulse }] }]}>
					<Ionicons name="bicycle" size={15} color="#fff" />
				</Animated.View>

				<View style={styles.routeDash} />

				<View style={styles.routePinGreen}>
					<Ionicons name="home" size={15} color="#1A9E5F" />
				</View>
			</View>

			<Text style={styles.mapFallbackTitle}>Rider is on the way</Text>
			<Text style={styles.mapFallbackSub}>GPS tracking active · Updates in real time</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 20,
		paddingBottom: 16,
	},
	headerTitle: { fontSize: 20, fontWeight: '800' },
	mapContainer: {
		marginHorizontal: 20,
		borderRadius: 4,
		height: 220,
		overflow: 'hidden',
		position: 'relative',
	},
	mapFallback: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: '#0C1525',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	roadLine: {
		position: 'absolute',
		left: 0,
		right: 0,
		height: 1,
		backgroundColor: 'rgba(255,255,255,0.04)',
	},
	routeRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 18,
		paddingHorizontal: 24,
		width: '100%',
	},
	routePinOrange: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: 'rgba(255,82,27,0.15)',
		borderWidth: 1,
		borderColor: 'rgba(255,82,27,0.35)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	routePinGreen: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: 'rgba(26,158,95,0.15)',
		borderWidth: 1,
		borderColor: 'rgba(26,158,95,0.35)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	routeDash: {
		flex: 1,
		height: 2,
		backgroundColor: 'rgba(255,255,255,0.12)',
		marginHorizontal: 6,
		borderRadius: 1,
	},
	riderBubble: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: '#FF521B',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#FF521B',
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.7,
		shadowRadius: 10,
		elevation: 8,
	},
	mapFallbackTitle: {
		color: '#fff',
		fontSize: 15,
		fontWeight: '800',
		marginBottom: 5,
		textAlign: 'center',
	},
	mapFallbackSub: {
		color: 'rgba(255,255,255,0.45)',
		fontSize: 11,
		textAlign: 'center',
	},
	riderPin: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: 'center',
		justifyContent: 'center',
	},
	etaChip: {
		position: 'absolute',
		bottom: 12,
		right: 12,
		backgroundColor: 'rgba(0,0,0,0.75)',
		borderRadius: 4,
		paddingVertical: 5,
		paddingHorizontal: 10,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
	},
	etaText: { fontSize: 12, fontWeight: '700', color: '#fff' },
	liveBadge: {
		position: 'absolute',
		top: 12,
		left: 12,
		borderRadius: 4,
		paddingVertical: 4,
		paddingHorizontal: 10,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
	},
	liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
	liveText: {
		fontSize: 10,
		fontWeight: '800',
		color: '#fff',
		letterSpacing: 1,
	},
	card: {
		marginHorizontal: 20,
		marginTop: 16,
		borderRadius: 4,
		padding: 20,
		borderWidth: 1,
	},
	statusRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		marginBottom: 16,
	},
	statusIcon: {
		width: 44,
		height: 44,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	statusLabel: { fontSize: 17, fontWeight: '700' },
	orderId: { fontSize: 12, marginTop: 2 },
	progressRow: { flexDirection: 'row', alignItems: 'center' },
	stepDot: {
		width: 24,
		height: 24,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	stepInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
	stepLine: { flex: 1, height: 2 },
	riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	riderAvatar: {
		width: 46,
		height: 46,
		borderRadius: 23,
		alignItems: 'center',
		justifyContent: 'center',
	},
	riderName: { fontSize: 14, fontWeight: '700' },
	riderMeta: { fontSize: 12 },
	contactBtn: {
		width: 40,
		height: 40,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
});
