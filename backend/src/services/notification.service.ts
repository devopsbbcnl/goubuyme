import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { recordError } from '../utils/recordError';
import { wantsNotification } from './notificationPrefs';

const expo = new Expo();

export interface PushPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export const sendPush = async (pushToken: string, payload: PushPayload): Promise<void> => {
  if (!Expo.isExpoPushToken(pushToken)) {
    recordError('notification', 'Invalid Expo push token', undefined, { pushToken });
    return;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: { type: payload.type, ...payload.data },
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          recordError('notification', 'Push error', undefined, { details: ticket.details });
        }
      }
    }
  } catch (err) {
    recordError('notification', 'sendPush failed', err);
  }
};

export const sendPushToMany = async (tokens: string[], payload: PushPayload): Promise<void> => {
  const valid = tokens.filter(Expo.isExpoPushToken);
  if (!valid.length) return;

  const messages: ExpoPushMessage[] = valid.map((to) => ({
    to,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: { type: payload.type, ...payload.data },
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    recordError('notification', 'sendPushToMany failed', err);
  }
};

// Sends a notification and keeps it in the user's inbox. A category the user has
// switched off is neither pushed nor stored, so the inbox only ever holds what
// they chose to hear about.
export const notifyUser = async (userId: string, payload: PushPayload): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true, notificationPrefs: true } });
  if (!user || !wantsNotification(user.notificationPrefs, payload.type)) return;

  await prisma.notification.create({
    data: { userId, title: payload.title, body: payload.body, type: payload.type, meta: payload.data as Prisma.InputJsonValue },
  });

  if (user.pushToken) await sendPush(user.pushToken, payload);
};
