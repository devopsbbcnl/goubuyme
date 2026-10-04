import { Socket } from 'socket.io';
import { recordError } from '../utils/recordError';
import { getIdentity } from './auth';
import { isValidCoordinate, publishRiderLocation } from './riderLocation';

// GPS fixes arrive every ~5s from the apps; anything faster is dropped.
const MIN_UPDATE_INTERVAL_MS = 2000;

export const setupRiderSocket = (socket: Socket): void => {
  let lastUpdateAt = 0;

  // The rider id in the payload is ignored (kept only so older app builds still
  // send a well-formed event): a rider can only ever move their own marker.
  socket.on('rider:updateLocation', async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    const identity = getIdentity(socket);
    if (!identity?.riderId) return;
    if (!isValidCoordinate(latitude, longitude)) return;

    const now = Date.now();
    if (now - lastUpdateAt < MIN_UPDATE_INTERVAL_MS) return;
    lastUpdateAt = now;

    try {
      await publishRiderLocation(identity.riderId, latitude, longitude);
    } catch (err) {
      recordError('rider-socket', 'rider:updateLocation failed', err, { riderId: identity.riderId });
    }
  });
};
