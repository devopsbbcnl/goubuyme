import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server } from 'socket.io';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Wires the Socket.IO Redis adapter so broadcasts (getIO().to(room).emit(...))
// reach clients regardless of which PM2 cluster worker holds their socket.
//
// Without this, in cluster mode an emit fired from an HTTP controller only
// reaches sockets connected to the SAME worker that handled the request —
// e.g. `order:new` would silently miss any vendor connected to another worker.
//
// The adapter attaches to the Server, so it covers every namespace
// (/orders, /riders) automatically.
export const attachRedisAdapter = (io: Server): void => {
  if (!process.env.REDIS_URL) {
    // Fine for single-instance/fork dev. In PM2 cluster mode this MUST be set,
    // otherwise cross-worker events are dropped.
    logger.warn(
      '[socket] REDIS_URL unset — skipping Redis adapter. OK for single-instance dev, ' +
      'but REQUIRED when running PM2 in cluster mode (instances > 1).'
    );
    return;
  }

  const pubClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => recordError('socket-adapter', '[socket] Redis pub client error', err));
  subClient.on('error', (err) => recordError('socket-adapter', '[socket] Redis sub client error', err));

  io.adapter(createAdapter(pubClient, subClient));
  logger.info('[socket] Redis adapter attached — cross-worker broadcasting enabled');
};
