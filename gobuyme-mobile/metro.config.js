const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

// MapLibre (@maplibre/maplibre-react-native) needs a native build — its codegen
// specs crash the Metro bundler in Expo Go. Detect that case and alias the package
// to a lightweight placeholder stub so map screens render a static placeholder and
// the rest of the app runs normally:
//   - EXPO_GO=1                     → force the mock
//   - no android/ dir (never run a native build) → mock automatically
//   - android/ dir present          → real MapLibre (native dev client)
const forceMock = process.env.EXPO_GO === '1';
const hasNative = fs.existsSync(path.join(__dirname, 'android'));

if (forceMock || !hasNative) {
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    '@maplibre/maplibre-react-native': path.resolve(
      __dirname,
      'mocks/maplibre.js',
    ),
  };
}

module.exports = config;
