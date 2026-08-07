import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface RiderPosition {
  lat: number;
  lng: number;
}

const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000').replace(/\/api\/v1\/?$/, '');

/** Streams the rider's live browser GPS position to the backend over the /riders socket namespace. */
export function useRiderLiveLocation(riderId: string | null, active: boolean) {
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState<RiderPosition | null>(null);

  useEffect(() => {
    if (!active || !riderId || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const socket = io(`${SOCKET_URL}/riders`, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        setPosition(next);
        socket.emit('rider:updateLocation', { riderId, latitude: next.lat, longitude: next.lng });
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
