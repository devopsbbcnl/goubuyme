/**
 * Stub MapLibre module used when EXPO_GO=1 (Expo Go client).
 * Map renders a styled placeholder; Camera and Marker are no-ops.
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
  icon:       { fontSize: 36 },
  hint:       { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 6 },
});

const Map = ({ style, children }) =>
  React.createElement(
    View,
    { style: [styles.placeholder, style] },
    React.createElement(Text, { style: styles.icon }, '🗺️'),
    React.createElement(Text, { style: styles.hint }, 'Map view • native build only'),
    React.createElement(View, { style: styles.badge },
      React.createElement(Text, { style: styles.badgeText }, 'EXPO GO'),
    ),
  );

const Camera = () => null;

const Marker = () => null;

module.exports = { Map, Camera, Marker };
