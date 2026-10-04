import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createAuthedSocket } from '@/services/socket';

export interface RiderPosition {
  lat: number;
  lng: number;
}

/** Streams the rider's live browser GPS position to the backend over the /riders socket namespace. */
export function useRiderLiveLocation(riderId: string | null, active: boolean) {
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState<RiderPosition | null>(null);

  useEffect(() => {
    if (!active || !riderId || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const socket = createAuthedSocket('/riders');
    socketRef.current = socket;

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        setPosition(next);
        // The server takes the rider from the authenticated socket, not the payload.
        socket.emit('rider:updateLocation', { latitude: next.lat, longitude: next.lng });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [active, riderId]);

  return { position };
}
