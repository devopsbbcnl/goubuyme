/**
 * Stub for @maplibre/maplibre-react-native, aliased in by metro.config.js when
 * EXPO_GO=1 (Expo Go client). The native map module's codegen specs crash the
 * Metro bundler in Expo Go, so map screens render a styled placeholder instead;
 * Camera/Marker/Source/Layer are inert. Real interactive maps in native builds.
 */
const React = require('react');
const { View, Text, StyleSheet } = require('react-native');

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#12202e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  icon: { fontSize: 36 },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 6 },
});

const MapStub = React.forwardRef(function MapStub({ style }, _ref) {
  return React.createElement(
    View,
    { style: [styles.placeholder, style] },
    React.createElement(Text, { style: styles.icon }, '🗺️'),
    React.createElement(Text, { style: styles.hint }, 'Map view • native build only'),
    React.createElement(
      View,
      { style: styles.badge },
      React.createElement(Text, { style: styles.badgeText }, 'EXPO GO'),
    ),
  );
});

const CameraStub = React.forwardRef(function CameraStub(_props, ref) {
  React.useImperativeHandle(ref, () => ({
    jumpTo: () => {},
    easeTo: () => {},
    flyTo: () => {},
    fitBounds: () => {},
    zoomTo: () => {},
    setStop: () => {},
  }));
  return null;
});

const Noop = () => null;

module.exports = {
  Map: MapStub,
  MapView: MapStub,
  Camera: CameraStub,
  Marker: Noop,
  MarkerView: Noop,
  PointAnnotation: Noop,
  ViewAnnotation: Noop,
  GeoJSONSource: Noop,
  ShapeSource: Noop,
  VectorSource: Noop,
  RasterSource: Noop,
  Layer: Noop,
  LineLayer: Noop,
  FillLayer: Noop,
  SymbolLayer: Noop,
  CircleLayer: Noop,
  Images: Noop,
  ImageSource: Noop,
  UserLocation: Noop,
  LocationManager: { start: () => {}, stop: () => {} },
};
