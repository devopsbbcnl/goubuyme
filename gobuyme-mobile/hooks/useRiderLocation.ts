import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { getRidersSocket, connectSockets } from '@/services/socketService';
import { useAuth } from '@/context/AuthContext';

// Emits the rider's live GPS position to the backend via Socket.io.
export function useRiderLocation(riderId: string | null, active: boolean) {
  const { user } = useAuth();
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!active || !riderId) return;

    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      connectSockets(user?.token ?? undefined);

      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        ({ coords }) => {
          const socket = getRidersSocket();
          if (!socket || !riderId) return;
          socket.emit('rider:updateLocation', {
            riderId,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
        },
      );
    })();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [active, riderId, user?.token]);
}
