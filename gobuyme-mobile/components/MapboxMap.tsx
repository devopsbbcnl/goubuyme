import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Mapbox, { MapView, Camera, ShapeSource, LineLayer, PointAnnotation, Images } from '@rnmapbox/maps';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '');

interface MapboxMapProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    zoomLevel?: number;
  };
  markers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
  }>;
  showUserLocation?: boolean;
  onRegionChange?: (region: { latitude: number; longitude: number }) => void;
}

export const MapboxMap: React.FC<MapboxMapProps> = ({
  initialRegion = { latitude: 6.5244, longitude: 3.3792, zoomLevel: 12 },
  markers = [],
  showUserLocation = true,
  onRegionChange,
}) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '');
    setIsReady(true);
  }, []);

  if (!isReady) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Camera
          zoomLevel={initialRegion.zoomLevel}
          centerCoordinate={[initialRegion.longitude, initialRegion.latitude]}
          onRegionDidChange={(feature) => {
            if (onRegionChange && feature.geometry?.coordinates) {
              onRegionChange({
                latitude: feature.geometry.coordinates[1],
                longitude: feature.geometry.coordinates[0],
              });
            }
          }}
        />
        {showUserLocation && <Mapbox.UserLocation />}
        {markers.map((marker) => (
          <PointAnnotation
            key={marker.id}
            id={marker.id}
            coordinate={[marker.longitude, marker.latitude]}
          >
            <View style={styles.markerContainer}>
              <View style={styles.marker} />
            </View>
          </PointAnnotation>
        ))}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF521B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
