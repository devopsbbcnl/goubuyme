'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api from '@/services/api';
import { normalizeState } from '@/lib/nigeriaStates';

// A state the user picked by hand. Absent means "follow my location".
const MANUAL_KEY = 'gbm_state_manual';
// The last state detected, used straight away on the next visit while a fresh fix is taken.
const DETECTED_KEY = 'gbm_state_detected';

export type LocationStatus = 'detecting' | 'ready' | 'denied' | 'unavailable';

interface StateCtx {
  /** The state whose vendors are shown: the manual pick if any, otherwise the detected one. */
  selectedState: string | null;
  detectedState: string | null;
  isManual: boolean;
  locationStatus: LocationStatus;
  /** False until we know which state to filter by (saved choice read AND detection finished or cached). */
  stateReady: boolean;
  setManualState: (state: string) => void;
  /** Drop the manual pick and follow the device location again. */
  followMyLocation: () => void;
}

const Ctx = createContext<StateCtx>({
  selectedState: null,
  detectedState: null,
  isManual: false,
  locationStatus: 'detecting',
  stateReady: false,
  setManualState: () => {},
  followMyLocation: () => {},
});

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* storage blocked: the choice just won't persist */ }
}

export function StateProvider({ children }: { children: ReactNode }) {
  const [manualState, setManualStateValue] = useState<string | null>(null);
  const [detectedState, setDetectedState] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('detecting');
  const [loaded, setLoaded] = useState(false);
  const detecting = useRef(false);

  const detect = useCallback(() => {
    if (detecting.current) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    detecting.current = true;
    setLocationStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await api.get('/geocode/reverse', {
            params: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          const found = normalizeState(r.data?.data?.state);
          if (found) {
            setDetectedState(found);
            setLocationStatus('ready');
            write(DETECTED_KEY, found);
          } else {
            setLocationStatus('unavailable');
          }
        } catch {
          setLocationStatus('unavailable');
        } finally {
          detecting.current = false;
        }
      },
      (err) => {
        setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        detecting.current = false;
      },
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    const m = normalizeState(read(MANUAL_KEY));
    if (m) setManualStateValue(m);
    const d = normalizeState(read(DETECTED_KEY));
    if (d) setDetectedState(d);
    setLoaded(true);
    detect();
  }, [detect]);

  const setManualState = useCallback((state: string) => {
    const canonical = normalizeState(state);
    if (!canonical) return;
    setManualStateValue(canonical);
    write(MANUAL_KEY, canonical);
  }, []);

  const followMyLocation = useCallback(() => {
    setManualStateValue(null);
    write(MANUAL_KEY, null);
    detect();
  }, [detect]);

  const selectedState = manualState ?? detectedState;
  // Wait for a fix only when there is nothing cached or chosen to go on.
  const stateReady = loaded && (selectedState !== null || locationStatus !== 'detecting');

  return (
    <Ctx.Provider
      value={{
        selectedState, detectedState, isManual: manualState !== null,
        locationStatus, stateReady, setManualState, followMyLocation,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useStateFilter = () => useContext(Ctx);
