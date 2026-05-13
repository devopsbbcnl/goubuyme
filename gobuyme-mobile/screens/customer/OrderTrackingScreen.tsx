import React, { useEffect, useRef } from 'react';
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
} from 'react-native';
import { MapView, Camera, MarkerView } from '@maplibre/maplibre-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useOrderTracking, OrderStatus } from '@/hooks/useOrderTracking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
	const insets = useSafeAreaInsets();
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
			<View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
				<TouchableOpacity
					onPress={() => router.back()}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="arrow-back" size={22} color={T.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: T.text }]}>
					Order Tracking
				</Text>
				<View style={{ width: 30 }} />
			</View>

			<ScrollView
				contentContainerStyle={{ paddingBottom: 100 }}
				showsVerticalScrollIndicator={false}
			>
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
	cameraRef,
	riderCoord,
	primaryColor,
}: {
	cameraRef: React.RefObject<any>;
	riderCoord: [number, number];
	primaryColor: string;
}) {
	return (
		<MapView style={StyleSheet.absoluteFillObject} styleURL={MAP_STYLE}>
			<Camera
				ref={cameraRef}
				defaultSettings={{ centerCoordinate: riderCoord, zoomLevel: 14 }}
			/>
			<MarkerView coordinate={riderCoord}>
				<View style={[styles.riderPin, { backgroundColor: primaryColor }]}>
					<Ionicons name="bicycle" size={14} color="#fff" />
				</View>
			</MarkerView>
		</MapView>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingBottom: 16,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 20, fontWeight: '800' },
	mapContainer: {
		marginHorizontal: 20,
		borderRadius: 4,
		height: 220,
		overflow: 'hidden',
		position: 'relative',
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
