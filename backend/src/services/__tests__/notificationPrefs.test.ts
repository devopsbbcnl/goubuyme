const db = {
  user: { findUnique: jest.fn() },
  notification: { create: jest.fn() },
};
jest.mock('../../config/db', () => ({ __esModule: true, default: db }));
jest.mock('../../utils/recordError', () => ({ recordError: jest.fn() }));
const mockSendNotifications = jest.fn().mockResolvedValue([]);
jest.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken = () => true;
    chunkPushNotifications = (m: unknown[]) => [m];
    sendPushNotificationsAsync = (...a: unknown[]) => mockSendNotifications(...a);
  }
  return { Expo };
});

import { categoryOf, isCategoryEnabled, mergePrefs, resolvePrefs, wantsNotification } from '../notificationPrefs';
import { notifyUser } from '../notification.service';

describe('notification preferences', () => {
  it('maps the server notification types onto categories', () => {
    expect(categoryOf('order')).toBe('orders');
    expect(categoryOf('job')).toBe('orders');
    expect(categoryOf('payout')).toBe('earnings');
    expect(categoryOf('referral')).toBe('earnings');
    expect(categoryOf('account')).toBe('account');
  });

  it('never lets a user switch off the platform speaking or a campaign', () => {
    const allOff = { orders: false, earnings: false, account: false };
    for (const type of ['broadcast', 'admin_message', 'campaign', 'something_new']) {
      expect(categoryOf(type)).toBeNull();
      expect(wantsNotification(allOff, type)).toBe(true);
    }
  });

  it('treats a missing key, or no prefs at all, as on', () => {
    expect(isCategoryEnabled(null, 'orders')).toBe(true);
    expect(isCategoryEnabled({}, 'orders')).toBe(true);
    expect(isCategoryEnabled({ orders: false }, 'earnings')).toBe(true);
    expect(isCategoryEnabled('garbage', 'orders')).toBe(true);
  });

  it('turns a category off only when it is explicitly false', () => {
    expect(isCategoryEnabled({ orders: false }, 'orders')).toBe(false);
    expect(wantsNotification({ orders: false }, 'order')).toBe(false);
  });

  it('merges a change over what was stored and resolves every category', () => {
    expect(mergePrefs({ orders: false }, { earnings: false })).toEqual({ orders: false, earnings: false, account: true });
    expect(mergePrefs({ orders: false }, { orders: true })).toEqual({ orders: true, earnings: true, account: true });
    expect(resolvePrefs(undefined)).toEqual({ orders: true, earnings: true, account: true });
  });
});

describe('notifyUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.notification.create.mockResolvedValue({});
  });

  const payload = { title: 'Order accepted', body: 'On its way', type: 'order' };

  it('stores the notification and pushes it when the category is on', async () => {
    db.user.findUnique.mockResolvedValue({ pushToken: 'ExponentPushToken[a]', notificationPrefs: null });
    await notifyUser('u1', payload);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendNotifications).toHaveBeenCalledTimes(1);
  });

  it('neither stores nor pushes when the user switched the category off', async () => {
    db.user.findUnique.mockResolvedValue({ pushToken: 'ExponentPushToken[a]', notificationPrefs: { orders: false } });
    await notifyUser('u1', payload);
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('still stores it, with no push, when the user has no push token', async () => {
    db.user.findUnique.mockResolvedValue({ pushToken: null, notificationPrefs: null });
    await notifyUser('u1', payload);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('delivers a broadcast-type message even with every category off', async () => {
    db.user.findUnique.mockResolvedValue({ pushToken: 'ExponentPushToken[a]', notificationPrefs: { orders: false, earnings: false, account: false } });
    await notifyUser('u1', { ...payload, type: 'admin_message' });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a user that no longer exists', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await notifyUser('ghost', payload);
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
