import { Socket, ExtendedError } from 'socket.io';
import prisma from '../config/db';
import { verifySocketTicket } from '../utils/generateToken';

/**
 * Identity attached to an authenticated socket. Everything handlers need for
 * authorization comes from here — never from client-supplied event payloads.
 */
export interface SocketIdentity {
  userId: string;
  role: string;
  customerId?: string;
  vendorId?: string;
  riderId?: string;
}

export const getIdentity = (socket: Socket): SocketIdentity | undefined =>
  socket.data.identity as SocketIdentity | undefined;

/**
 * Handshake middleware for every namespace.
 *
 * - No ticket → connection allowed as a guest. The mobile login screen opens an
 *   unauthenticated socket purely as a "backend online" indicator; guests get no
 *   rooms and every event handler ignores them.
 * - Invalid/expired ticket, or inactive/deleted account → connection refused, so
 *   the client's auth callback fetches a fresh ticket on the next reconnect.
 */
export const socketAuth = async (socket: Socket, next: (err?: ExtendedError) => void): Promise<void> => {
  const ticket = socket.handshake.auth?.ticket;
  if (!ticket || typeof ticket !== 'string') return next();

  let payload: { userId: string; role: string };
  try {
    payload = verifySocketTicket(ticket);
  } catch {
    return next(new Error('UNAUTHORIZED'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true, role: true, isActive: true, deletedAt: true,
        customer: { select: { id: true } },
        vendor: { select: { id: true } },
        rider: { select: { id: true } },
      },
    });
    if (!user || !user.isActive || user.deletedAt) return next(new Error('UNAUTHORIZED'));

    const identity: SocketIdentity = {
      userId: user.id,
      role: user.role,
      customerId: user.customer?.id,
      vendorId: user.vendor?.id,
      riderId: user.rider?.id,
    };
    socket.data.identity = identity;
    next();
  } catch {
    next(new Error('UNAUTHORIZED'));
  }
};
