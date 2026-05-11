const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const config = getDefaultConfig(__dirname);

// Mock @maplibre when:
//   1. EXPO_GO=1 is set explicitly, OR
//   2. The android/ native project hasn't been generated yet (no native build ever run)
// In both cases MapLibre's native modules aren't available so we serve a
// placeholder UI instead. Once `npx expo run:android` is run the android/
// directory is created and real MapLibre is used automatically.
const nativeProjectExists = fs.existsSync(
  path.join(__dirname, 'android', 'app', 'build.gradle'),
);
const useMapMock = process.env.EXPO_GO === '1' || !nativeProjectExists;

if (useMapMock) {
  const maplibreMock = path.resolve(__dirname, 'mocks', 'maplibre.js');

  config.resolver = config.resolver ?? {};
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === '@maplibre/maplibre-react-native') {
      return { type: 'sourceFile', filePath: maplibreMock };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
