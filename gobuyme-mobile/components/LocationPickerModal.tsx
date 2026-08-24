import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reverseGeocode } from '@/services/geocoding';

// Falls back to a central-Nigeria region (near Owerri, matching OrderTrackingScreen's
// DEFAULT_COORD) when there's no existing address and GPS isn't available/granted yet.
const DEFAULT_REGION: Region = {
	latitude: 5.4836,
	longitude: 7.0348,
	latitudeDelta: 0.05,
	longitudeDelta: 0.05,
};

interface Props {
	visible: boolean;
	initial?: { lat: number; lng: number } | null;
	onCancel: () => void;
	onConfirm: (result: { lat: number; lng: number }) => void;
}

// Fallback for when text geocoding can't resolve an address (common for Nigerian
// landmark-style addresses with no house number) and the user isn't physically at the
// location to use GPS — the pin stays fixed at screen-center and the map moves underneath
// it, then the confirmed coordinate is reverse-geocoded just to sanity-check on return.
export default function LocationPickerModal({ visible, initial, onCancel, onConfirm }: Props) {
	const { theme: T } = useTheme();
	const insets = useSafeAreaInsets();
	const mapRef = useRef<MapView>(null);
	const [region, setRegion] = useState<Region>({
		latitude: initial?.lat ?? DEFAULT_REGION.latitude,
		longitude: initial?.lng ?? DEFAULT_REGION.longitude,
		latitudeDelta: 0.02,
		longitudeDelta: 0.02,
	});
	const [locating, setLocating] = useState(false);
	const [confirming, setConfirming] = useState(false);

	const recenterToMe = async () => {
		setLocating(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== 'granted') return;
			const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
			const next: Region = {
				latitude: loc.coords.latitude,
				longitude: loc.coords.longitude,
				latitudeDelta: 0.02,
				longitudeDelta: 0.02,
			};
			setRegion(next);
			mapRef.current?.animateToRegion(next, 500);
		} catch {
			// GPS unavailable — user can still drop the pin manually
		} finally {
			setLocating(false);
		}
	};

	const confirm = async () => {
		setConfirming(true);
		try {
			// Reverse-geocode is best-effort context only — the pin's raw lat/lng is what
			// gets saved regardless of whether this resolves.
			await reverseGeocode(region.latitude, region.longitude);
			onConfirm({ lat: region.latitude, lng: region.longitude });
		} finally {
			setConfirming(false);
		}
	};

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
			<View style={{ flex: 1, backgroundColor: T.bg }}>
				<MapView
					ref={mapRef}
					provider={PROVIDER_GOOGLE}
					style={StyleSheet.absoluteFillObject}
					initialRegion={region}
					onRegionChangeComplete={setRegion}
				/>

				{/* Fixed center pin — map moves beneath it */}
				<View pointerEvents="none" style={styles.pinWrap}>
					<Ionicons name="location" size={40} color={T.primary} />
				</View>

				<View style={[styles.header, { paddingTop: insets.top + 12 }]}>
					<TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
						<Ionicons name="close" size={22} color="#fff" />
					</TouchableOpacity>
					<View style={styles.headerBadge}>
						<Text style={styles.headerText}>Drag the map so the pin sits on your delivery location</Text>
					</View>
				</View>

				<TouchableOpacity
					onPress={recenterToMe}
					disabled={locating}
					style={[styles.recenterBtn, { bottom: insets.bottom + 96, backgroundColor: T.surface }]}
					activeOpacity={0.8}
				>
					{locating ? (
						<ActivityIndicator size="small" color={T.primary} />
					) : (
						<Ionicons name="locate" size={20} color={T.primary} />
					)}
				</TouchableOpacity>

				<View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: T.surface }]}>
					<TouchableOpacity
						onPress={confirm}
						disabled={confirming}
						style={[styles.confirmBtn, { backgroundColor: confirming ? T.surface3 : T.primary }]}
						activeOpacity={0.85}
					>
						{confirming ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.confirmText}>Use This Location</Text>
						)}
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	pinWrap: {
		position: 'absolute',
		top: '50%',
		left: '50%',
		marginLeft: -20,
		marginTop: -40,
		zIndex: 5,
	},
	header: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		paddingHorizontal: 16,
		gap: 10,
	},
	closeBtn: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: 'rgba(0,0,0,0.5)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	headerBadge: {
		backgroundColor: 'rgba(0,0,0,0.6)',
		borderRadius: 8,
		padding: 10,
	},
	headerText: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
	recenterBtn: {
		position: 'absolute',
		right: 16,
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: 'center',
		justifyContent: 'center',
		elevation: 4,
		shadowColor: '#000',
		shadowOpacity: 0.2,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
	},
	footer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		padding: 16,
	},
	confirmBtn: {
		height: 50,
		borderRadius: 4,
		alignItems: 'center',
		justifyContent: 'center',
	},
	confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
