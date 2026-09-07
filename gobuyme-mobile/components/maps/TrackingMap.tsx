import React, {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
} from 'react';
import { View, Text, StyleSheet, Platform, Linking, Alert } from 'react-native';
import {
	Map,
	Camera,
	Marker,
	GeoJSONSource,
	Layer,
	type CameraRef,
} from '@maplibre/maplibre-react-native';

// Free, keyless vector tiles — no billing account required. Identical style to the
// web app (gobuyme-web/components/rider/DeliveryMap.tsx).
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Central-Nigeria fallback (near Owerri) when no coordinates are known yet.
const FALLBACK: LatLng = { lat: 5.4836, lng: 7.0348 };

export interface LatLng {
	lat: number;
	lng: number;
}
interface Place extends LatLng {
	name?: string;
}

export interface TrackingMapHandle {
	/** Recenter the map on a point (used for in-app "navigate" on the rider screen). */
	flyTo: (p: LatLng) => void;
}

interface Props {
	vendor?: Place | null;
	customer?: Place | null;
	riderPosition?: LatLng | null;
	style?: any;
}

// Tapping the map hands off to the device's default maps app for an expanded view /
// turn-by-turn. Native scheme first, web Google Maps as the universal fallback.
function openInMapsApp(dest: LatLng, label?: string) {
	const { lat, lng } = dest;
	const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
	const native = Platform.select({
		ios: `maps://?daddr=${lat},${lng}`,
		android: `geo:${lat},${lng}?q=${lat},${lng}${
			label ? `(${encodeURIComponent(label)})` : ''
		}`,
		default: web,
	})!;
	Linking.openURL(native).catch(() =>
		Linking.openURL(web).catch(() =>
			Alert.alert('Error', 'Could not open a maps app on this device.'),
		),
	);
}

function Pin({ emoji, color }: { emoji: string; color: string }) {
	return (
		<View style={[styles.pin, { backgroundColor: color }]}>
			<Text style={styles.pinEmoji}>{emoji}</Text>
		</View>
	);
}

/**
 * Shared MapLibre map for delivery tracking — a 1:1 port of the web app's
 * DeliveryMap: vendor / customer / rider markers, a dashed route line between the
 * two endpoints, and a camera that fits both endpoints. Tap anywhere to open the
 * device maps app.
 */
const TrackingMap = forwardRef<TrackingMapHandle, Props>(function TrackingMap(
	{ vendor, customer, riderPosition, style },
	ref,
) {
	const cameraRef = useRef<CameraRef>(null);

	useImperativeHandle(ref, () => ({
		flyTo: ({ lat, lng }) =>
			cameraRef.current?.flyTo({ center: [lng, lat], zoom: 15 }),
	}));

	// Fit both delivery endpoints whenever they change — not on every rider GPS
	// tick (mirrors the web DeliveryMap).
	useEffect(() => {
		if (vendor && customer) {
			cameraRef.current?.fitBounds(
				[
					Math.min(vendor.lng, customer.lng),
					Math.min(vendor.lat, customer.lat),
					Math.max(vendor.lng, customer.lng),
					Math.max(vendor.lat, customer.lat),
				],
				{ padding: { top: 56, right: 56, bottom: 56, left: 56 }, duration: 600 },
			);
		} else if (riderPosition) {
			cameraRef.current?.easeTo({
				center: [riderPosition.lng, riderPosition.lat],
				zoom: 14,
				duration: 400,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [vendor?.lat, vendor?.lng, customer?.lat, customer?.lng]);

	const center = riderPosition ?? customer ?? vendor ?? FALLBACK;
	const tapTarget = riderPosition ?? customer ?? vendor ?? null;

	return (
		<Map
			style={style ?? StyleSheet.absoluteFillObject}
			mapStyle={MAP_STYLE_URL}
			logo={false}
			attribution={false}
			compass={false}
			onPress={
				tapTarget
					? () => openInMapsApp(tapTarget, customer?.name)
					: undefined
			}
		>
			<Camera
				ref={cameraRef}
				initialViewState={{ center: [center.lng, center.lat], zoom: 13 }}
				minZoom={3}
			/>

			{vendor && customer && (
				<GeoJSONSource
					id="delivery-route"
					data={{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'LineString',
							coordinates: [
								[vendor.lng, vendor.lat],
								[customer.lng, customer.lat],
							],
						},
					}}
				>
					<Layer
						id="delivery-route-line"
						type="line"
						layout={{ 'line-cap': 'round', 'line-join': 'round' }}
						paint={{
							'line-color': '#0077FF',
							'line-width': 2.5,
							'line-dasharray': [2, 1.5],
						}}
					/>
				</GeoJSONSource>
			)}

			{vendor && (
				<Marker lngLat={[vendor.lng, vendor.lat]}>
					<Pin emoji="🏪" color="#FF521B" />
				</Marker>
			)}
			{customer && (
				<Marker lngLat={[customer.lng, customer.lat]}>
					<Pin emoji="🏠" color="#1A9E5F" />
				</Marker>
			)}
			{riderPosition && (
				<Marker lngLat={[riderPosition.lng, riderPosition.lat]}>
					<Pin emoji="🏍️" color="#0077FF" />
				</Marker>
			)}
		</Map>
	);
});

export default TrackingMap;

const styles = StyleSheet.create({
	pin: {
		width: 32,
		height: 32,
		borderRadius: 9999,
		alignItems: 'center',
		justifyContent: 'center',
		borderWidth: 2,
		borderColor: '#fff',
		shadowColor: '#000',
		shadowOpacity: 0.35,
		shadowRadius: 3,
		shadowOffset: { width: 0, height: 2 },
		elevation: 3,
	},
	pinEmoji: { fontSize: 16 },
});
