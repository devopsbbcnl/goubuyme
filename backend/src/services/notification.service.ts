import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from '../utils/logger';

const expo = new Expo();

export interface PushPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export const sendPush = async (pushToken: string, payload: PushPayload): Promise<void> => {
  if (!Expo.isExpoPushToken(pushToken)) {
    logger.warn(`Invalid Expo push token: ${pushToken}`);
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
          logger.error('Push error', { details: ticket.details });
        }
      }
    }
  } catch (err) {
    logger.error('sendPush failed', err);
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
    logger.error('sendPushToMany failed', err);
  }
};

export const notifyUser = async (userId: string, payload: PushPayload): Promise<void> => {
  await prisma.notification.create({
    data: { userId, title: payload.title, body: payload.body, type: payload.type, meta: payload.data as Prisma.InputJsonValue },
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } });
  if (user?.pushToken) await sendPush(user.pushToken, payload);
};
