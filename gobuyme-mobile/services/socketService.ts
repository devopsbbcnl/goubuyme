import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api from './api';
import { requirePublicEnv } from './env';

// Fails fast in production builds if the URL is missing, instead of silently
// falling back to localhost (which on a device points at the phone itself and
// surfaces as a socket.io connection error).
const SOCKET_URL = requirePublicEnv('EXPO_PUBLIC_SOCKET_URL', process.env.EXPO_PUBLIC_SOCKET_URL, 'http://localhost:5000');

let ordersSocket: Socket | null = null;
let ridersSocket: Socket | null = null;

// The access token the current connections were opened for. When a caller passes a
// different one (login, account switch) we reconnect so the handshake carries it.
let connectedForToken: string | undefined;

// Order rooms the UI wants. Rooms are server-side per connection, so they are
// re-joined after every (re)connect rather than emitted once.
const wantedOrderRooms = new Set<string>();

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

/**
 * Handshake credentials, evaluated on every connect and reconnect. Signed-in users
 * get a fresh 60s socket ticket (fetched through `api`, so an expired access token
 * is refreshed by the normal interceptor). Signed-out users connect as guests: the
 * server accepts that but gives guests no rooms and ignores their events.
 */
const socketAuth = (cb: (data: object) => void) => {
  SecureStore.getItemAsync('accessToken')
    .then((token) => {
      if (!token) return cb({});
      return api
        .post('/auth/socket-ticket')
        .then((res) => cb({ ticket: res.data?.data?.ticket }))
        .catch(() => cb({}));
    })
    .catch(() => cb({}));
};

const createSocket = (namespace: '/orders' | '/riders'): Socket => {
  const socket = io(`${SOCKET_URL}${namespace}`, {
    auth: socketAuth,
    // WebSocket-only: the backend runs in PM2 cluster mode, where HTTP
    // long-polling breaks (each poll can hit a different worker => "Session
    // ID unknown" => xhr post error). A single persistent WS pins to one
    // worker and sidesteps that entirely. Cloudflare passes the WS upgrade.
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
  });

  // A handshake refused by the server's auth middleware (expired ticket, account
  // deactivated) is not retried automatically by socket.io; retry once after a
  // pause so the auth callback can fetch a fresh ticket.
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED' && !socket.active) {
      setTimeout(() => { if (!socket.connected) socket.connect(); }, 5000);
    }
  });

  if (namespace === '/orders') {
    socket.on('connect', () => {
      wantedOrderRooms.forEach((orderId) => socket.emit('order:join', { orderId }));
    });
  }

  return socket;
};

const attachStatusListeners = () => {
  if (statusListenersAttached) return;
  statusListenersAttached = true;

  if (!ordersSocket) ordersSocket = createSocket('/orders');
  const s = ordersSocket;

  // socket.io-client emits `connect`/`disconnect` for connectivity to the namespace server.
  s.on('connect', () => notifyBackend(true));
  s.on('disconnect', (reason) => {
    console.log('[socketService.ts] /orders disconnect:', reason);
    notifyBackend(false);
  });
  s.on('connect_error', (err) => {
    // `err.message` is the generic label ("websocket error"). The real cause
    // (HTTP status, transport detail) is on `description`/`context`.
    const anyErr = err as any;
    console.log('[socketService.ts] /orders connect_error:', err.message,
      '| description:', anyErr?.description,
      '| context:', anyErr?.context,
      '| transport:', (s.io?.engine as any)?.transport?.name,
      '| uri:', (s.io as any)?.uri);
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

const reconnect = (socket: Socket) => {
  socket.disconnect();
  socket.connect();
};

export const connectSockets = (token?: string) => {
  // Always create sockets lazily, but ensure indicator listeners are attached.
  attachStatusListeners();

  if (!ordersSocket) ordersSocket = createSocket('/orders');
  if (!ridersSocket) ridersSocket = createSocket('/riders');

  if (token && token !== connectedForToken) {
    // Existing connections were opened as a guest or for another session.
    connectedForToken = token;
    reconnect(ordersSocket);
    reconnect(ridersSocket);
  } else {
    if (!ordersSocket.connected) ordersSocket.connect();
    if (!ridersSocket.connected) ridersSocket.connect();
  }

  return { ordersSocket, ridersSocket };
};

/** Subscribe this connection to an order's events. The server only allows the order's own customer, vendor or rider. */
export const joinOrderRoom = (orderId: string) => {
  wantedOrderRooms.add(orderId);
  if (ordersSocket?.connected) ordersSocket.emit('order:join', { orderId });
};

export const leaveOrderRoom = (orderId: string) => {
  wantedOrderRooms.delete(orderId);
};

export const disconnectSockets = () => {
  ordersSocket?.disconnect();
  ridersSocket?.disconnect();
  ordersSocket = null;
  ridersSocket = null;
  connectedForToken = undefined;
  wantedOrderRooms.clear();
  statusListenersAttached = false;
  notifyBackend(false);
};

export const getOrdersSocket = () => ordersSocket;
export const getRidersSocket = () => ridersSocket;
