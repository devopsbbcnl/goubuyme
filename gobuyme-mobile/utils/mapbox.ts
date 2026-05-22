import Mapbox from '@rnmapbox/maps';

export function initializeMapbox() {
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn('Mapbox access token not found. Please set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file.');
    return false;
  }
  Mapbox.setAccessToken(accessToken);
  return true;
}
