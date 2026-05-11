import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let ordersSocket: Socket | null = null;
let ridersSocket: Socket | null = null;

export const connectSockets = (token?: string) => {
  const authOpts = token ? { auth: { token } } : {};

  if (!ordersSocket?.connected) {
    ordersSocket = io(`${SOCKET_URL}/orders`, {
      ...authOpts,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  }

  if (!ridersSocket?.connected) {
    ridersSocket = io(`${SOCKET_URL}/riders`, {
      ...authOpts,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
  }

  return { ordersSocket, ridersSocket };
};

export const disconnectSockets = () => {
  ordersSocket?.disconnect();
  ridersSocket?.disconnect();
  ordersSocket = null;
  ridersSocket = null;
};

export const getOrdersSocket = () => ordersSocket;
export const getRidersSocket = () => ridersSocket;
