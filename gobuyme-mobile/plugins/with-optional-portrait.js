// Google Play treats `android:screenOrientation="portrait"` as a hard requirement for the
// android.hardware.screen.portrait feature, which hides the app from landscape-only devices
// (some tablets, desktops, Android XR). Declaring the feature as not required keeps the app
// portrait-locked but installable everywhere.
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURES = ['android.hardware.screen.portrait', 'android.hardware.screen.landscape'];

module.exports = function withOptionalOrientationFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const existing = manifest['uses-feature'] ?? [];
    for (const name of FEATURES) {
      const found = existing.find((f) => f.$['android:name'] === name);
      if (found) found.$['android:required'] = 'false';
      else existing.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = existing;
    return cfg;
  });
};
