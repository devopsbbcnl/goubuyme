import webpush from 'web-push';
import prisma from '../config/db';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:ops@gobuyme.shop';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface WebPushPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

export const sendWebPush = async (userId: string, payload: WebPushPayload): Promise<void> => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    recordError('webPush', 'Web push not configured (VAPID keys missing)', undefined, { userId });
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          recordError('webPush', 'sendNotification failed', err, { userId, endpoint: sub.endpoint });
        }
      }
    }),
  );

  if (staleIds.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    logger.info(`Pruned ${staleIds.length} stale web push subscription(s) for user ${userId}`);
  }
};
