import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { reverseGeocode } from '@/services/geocoding';
import { normalizeState } from '@/constants/nigeriaStates';

// A state the user picked by hand. Absent means "follow my location".
const MANUAL_KEY = '@gobuyme:selected_state';
// The last state we detected, used when location is off or unavailable on a later launch.
const DETECTED_KEY = '@gobuyme:detected_state';

export type LocationStatus = 'detecting' | 'ready' | 'denied' | 'unavailable';

interface StateContextValue {
  /** The state whose vendors are shown: the manual pick if any, otherwise the detected one. */
  selectedState: string | null;
  /** State from the device location (null until detected, or when location is off). */
  detectedState: string | null;
  /** True when the user picked a state by hand instead of using their location. */
  isManual: boolean;
  locationStatus: LocationStatus;
  /** Show vendors from another state (remembered until the user goes back to their location). */
  setManualState: (state: string) => Promise<void>;
  /** Drop the manual pick and follow the device location again. */
  followMyLocation: () => Promise<void>;
  /** False until the saved choice has been read from storage. */
  stateLoaded: boolean;
}

const StateContext = createContext<StateContextValue>({
  selectedState: null,
  detectedState: null,
  isManual: false,
  locationStatus: 'detecting',
  setManualState: async () => {},
  followMyLocation: async () => {},
  stateLoaded: false,
});

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [manualState, setManualStateValue] = useState<string | null>(null);
  const [detectedState, setDetectedState] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('detecting');
  const [stateLoaded, setStateLoaded] = useState(false);
  const detecting = useRef(false);

  const detect = useCallback(async () => {
    if (detecting.current) return;
    detecting.current = true;
    setLocationStatus('detecting');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocationStatus('denied');
        return;
      }
      // A last-known fix is instant and plenty accurate for "which state"; fall back to a fresh one.
      let pos = await Location.getLastKnownPositionAsync();
      if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      const found = normalizeState(place?.state);
      if (!found) {
        setLocationStatus('unavailable');
        return;
      }
      setDetectedState(found);
      setLocationStatus('ready');
      AsyncStorage.setItem(DETECTED_KEY, found).catch(() => {});
    } catch {
      setLocationStatus('unavailable');
    } finally {
      detecting.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [manual, lastDetected] = await Promise.all([
          AsyncStorage.getItem(MANUAL_KEY),
          AsyncStorage.getItem(DETECTED_KEY),
        ]);
        const m = normalizeState(manual);
        if (m) setManualStateValue(m);
        // Show the previous detection straight away; a fresh fix replaces it a moment later.
        const d = normalizeState(lastDetected);
        if (d) setDetectedState(d);
      } finally {
        setStateLoaded(true);
      }
      detect();
    })();
  }, [detect]);

  const setManualState = useCallback(async (state: string) => {
    const canonical = normalizeState(state);
    if (!canonical) return;
    setManualStateValue(canonical);
    await AsyncStorage.setItem(MANUAL_KEY, canonical);
  }, []);

  const followMyLocation = useCallback(async () => {
    setManualStateValue(null);
    await AsyncStorage.removeItem(MANUAL_KEY);
    // Ask again in case permission was granted since, or the user has travelled.
    detect();
  }, [detect]);

  const selectedState = manualState ?? detectedState;

  return (
    <StateContext.Provider
      value={{
        selectedState,
        detectedState,
        isManual: manualState !== null,
        locationStatus,
        setManualState,
        followMyLocation,
        stateLoaded,
      }}
    >
      {children}
    </StateContext.Provider>
  );
}

export function useStateFilter() {
  return useContext(StateContext);
}
