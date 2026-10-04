import { io, Socket } from 'socket.io-client';
import api from '@/services/api';

const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:5000').replace(/\/api\/v1\/?$/, '');

/**
 * Opens an authenticated Socket.io connection. The access token lives in an
 * httpOnly cookie, so the handshake uses a 60s socket ticket fetched through the
 * BFF proxy — re-fetched on every reconnect via the `auth` callback. Without a
 * ticket the server treats the socket as a guest and ignores all its events.
 */
export function createAuthedSocket(namespace: '/orders' | '/riders'): Socket {
  const socket = io(`${SOCKET_URL}${namespace}`, {
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      api.post('/auth/socket-ticket')
        .then((res) => cb({ ticket: res.data?.data?.ticket }))
        .catch(() => cb({}));
    },
  });

  // Handshakes refused by the server's auth middleware are not retried
  // automatically; retry after a pause so `auth` can fetch a fresh ticket.
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED' && !socket.active) {
      setTimeout(() => { if (!socket.connected) socket.connect(); }, 5000);
    }
  });

  return socket;
}
