import { io, Socket } from 'socket.io-client';
import { requirePublicEnv } from './env';

// Fails fast in production builds if the URL is missing, instead of silently
// falling back to localhost (which on a device points at the phone itself and
// surfaces as a socket.io connection error).
const SOCKET_URL = requirePublicEnv('EXPO_PUBLIC_SOCKET_URL', 'http://localhost:5000');

let ordersSocket: Socket | null = null;
let ridersSocket: Socket | null = null;

// Backend connectivity indicator
// We treat "connected" as online for the purposes of the login indicator.

// - true  => at least one socket is connected
// - false => no socket connected / connect error / disconnected
let backendOnline: boolean = false;
let backendStatusSubscribers: Array<(online: boolean) => void> = [];
let statusListenersAttached = false;

const notifyBackend = (online: boolean) => {
  backendOnline = online;
  backendStatusSubscribers.forEach((cb) => cb(online));
};

const attachStatusListeners = () => {
  if (statusListenersAttached) return;
  statusListenersAttached = true;

  const socketForListen = () => {
    // ensure orders socket exists; if not, we create it without auth
    if (!ordersSocket) {
      ordersSocket = io(`${SOCKET_URL}/orders`, {
        // WebSocket-only: the backend runs in PM2 cluster mode, where HTTP
        // long-polling breaks (each poll can hit a different worker => "Session
        // ID unknown" => xhr post error). A single persistent WS pins to one
        // worker and sidesteps that entirely. Cloudflare passes the WS upgrade.
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
      });
    }
    return ordersSocket;
  };

  const s = socketForListen();

  // socket.io-client emits `connect`/`disconnect` for connectivity to the namespace server.
  s.on('connect', () => notifyBackend(true));
  s.on('disconnect', (reason) => {
    console.log('[socketService.ts] /orders disconnect:', reason);
    notifyBackend(false);
  });
  s.on('connect_error', (err) => {
    console.log('[socketService.ts] /orders connect_error:', err.message);
    notifyBackend(false);
  });
};

export const subscribeBackendStatus = (cb: (online: boolean) => void) => {
  attachStatusListeners();
  backendStatusSubscribers.push(cb);
  // send current value immediately
  cb(backendOnline);

  return () => {
    backendStatusSubscribers = backendStatusSubscribers.filter((x) => x !== cb);
  };
};

export const getBackendOnline = () => backendOnline;

export const connectSockets = (token?: string) => {
  const authOpts = token ? { auth: { token } } : {};

  // Always create sockets lazily, but ensure indicator listeners are attached.
  attachStatusListeners();

  if (!ordersSocket) {
    ordersSocket = io(`${SOCKET_URL}/orders`, {
      ...authOpts,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  } else if (!ordersSocket.connected) {
    // Update auth by reconnecting if needed.
    ordersSocket.connect();
  }

  if (!ridersSocket) {
    ridersSocket = io(`${SOCKET_URL}/riders`, {
      ...authOpts,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  } else if (!ridersSocket.connected) {
    ridersSocket.connect();
  }

  return { ordersSocket, ridersSocket };
};

export const disconnectSockets = () => {
  ordersSocket?.disconnect();
  ridersSocket?.disconnect();
  ordersSocket = null;
  ridersSocket = null;
  notifyBackend(false);
};

export const getOrdersSocket = () => ordersSocket;
export const getRidersSocket = () => ridersSocket;


