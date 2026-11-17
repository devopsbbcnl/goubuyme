const db = {
  user: { count: jest.fn(), findMany: jest.fn() },
  broadcast: { findFirst: jest.fn(), create: jest.fn() },
  notification: { createMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('../../config/db', () => ({ __esModule: true, default: db }));
const mockSendPushToMany = jest.fn();
jest.mock('../notification.service', () => ({ sendPushToMany: (...a: unknown[]) => mockSendPushToMany(...a) }));
jest.mock('../webPush.service', () => ({ sendWebPush: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/recordError', () => ({ recordError: jest.fn() }));
const mockSendEmailBatch = jest.fn();
jest.mock('../email.service', () => ({ emailLayout: (c: string) => c, sendEmailBatch: (...a: unknown[]) => mockSendEmailBatch(...a) }));
process.env.JWT_ACCESS_SECRET = 'test-secret';

import { audienceWhere, send, BroadcastError, broadcastEmailHtml } from '../broadcast.service';

const input = { title: 'Heads up', body: 'We are down tonight', audience: 'VENDORS' as const };

beforeEach(() => {
  jest.clearAllMocks();
  db.broadcast.findFirst.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({});
  db.notification.createMany.mockResolvedValue({ count: 0 });
  mockSendEmailBatch.mockResolvedValue({ sent: 0, failed: 0 });
});

describe('audienceWhere', () => {
  it('only ever addresses active, undeleted customers, vendors, riders and logistics companies', () => {
    expect(audienceWhere('ALL')).toEqual({ role: { in: ['CUSTOMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY'] }, isActive: true, deletedAt: null });
  });

  it('never includes admin roles', () => {
    for (const a of ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'LOGISTICS_COMPANIES'] as const) {
      const roles = (audienceWhere(a).role as { in: string[] }).in;
      expect(roles.some(r => r.endsWith('_ADMIN'))).toBe(false);
    }
  });

  it('narrows to one role', () => {
    expect((audienceWhere('RIDERS').role as { in: string[] }).in).toEqual(['RIDER']);
  });

  it('narrows to logistics companies', () => {
    expect((audienceWhere('LOGISTICS_COMPANIES').role as { in: string[] }).in).toEqual(['LOGISTICS_COMPANY']);
  });

  it('narrows a single-user message to that one active account', () => {
    expect(audienceWhere('USER', 'u1')).toEqual({
      role: { in: ['CUSTOMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY'] }, isActive: true, deletedAt: null, id: 'u1',
    });
  });

  it('matches nobody when a single-user message has no target', () => {
    expect(audienceWhere('USER')).toMatchObject({ id: '' });
  });
});

describe('send', () => {
  it('rejects the same message to the same audience sent moments ago', async () => {
    db.broadcast.findFirst.mockResolvedValue({ id: 'b0' });
    await expect(send('admin1', input)).rejects.toMatchObject({ status: 409 });
    expect(db.broadcast.create).not.toHaveBeenCalled();
  });

  it('refuses an audience with nobody in it', async () => {
    db.user.count.mockResolvedValue(0);
    await expect(send('admin1', input)).rejects.toBeInstanceOf(BroadcastError);
    expect(db.broadcast.create).not.toHaveBeenCalled();
  });

  it('records the broadcast and delivers a notification and push to each recipient', async () => {
    db.user.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    db.broadcast.create.mockResolvedValue({ id: 'b1' });
    db.user.findMany.mockResolvedValue([
      { id: 'u1', pushToken: 'ExponentPushToken[a]', pushSubscriptions: [] },
      { id: 'u2', pushToken: null, pushSubscriptions: [] },
    ]);

    const b = await send('admin1', input);
    await new Promise(r => setImmediate(r)); // delivery runs after the record is written

    expect(b.id).toBe('b1');
    expect(db.broadcast.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ authorId: 'admin1', audience: 'VENDORS', recipientCount: 2, pushCount: 1 }),
    });
    expect(db.notification.createMany).toHaveBeenCalledTimes(1);
    expect(db.notification.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(mockSendPushToMany).toHaveBeenCalledWith(['ExponentPushToken[a]'], expect.objectContaining({ type: 'broadcast' }));
  });

  describe('by email', () => {
    const email = { ...input, sendEmail: true, emailType: 'SERVICE' as const };

    it('needs a channel', async () => {
      await expect(send('admin1', { ...input, sendInApp: false })).rejects.toThrow('Choose at least one way to send');
    });

    it('needs to know if the email is a service notice or a promotion', async () => {
      await expect(send('admin1', { ...input, sendEmail: true })).rejects.toThrow('service notice or a promotion');
      expect(db.broadcast.create).not.toHaveBeenCalled();
    });

    it('records the email and sends it in batches, without touching notifications when in-app is off', async () => {
      db.user.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      db.broadcast.create.mockResolvedValue({ id: 'b3' });
      db.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'Ada Obi', email: 'ada@x.com' },
        { id: 'u2', name: 'Chi', email: 'chi@x.com' },
      ]);
      mockSendEmailBatch.mockResolvedValue({ sent: 2, failed: 0 });

      await send('admin1', { ...email, sendInApp: false });
      await new Promise(r => setImmediate(r));

      expect(db.broadcast.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sendInApp: false, sendEmail: true, emailType: 'SERVICE', emailCount: 2, pushCount: 0 }),
      });
      expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
      expect(mockSendEmailBatch.mock.calls[0][0]).toEqual([
        expect.objectContaining({ to: 'ada@x.com', subject: 'Heads up' }),
        expect.objectContaining({ to: 'chi@x.com' }),
      ]);
      expect(db.notification.createMany).not.toHaveBeenCalled();
    });

    it('a promotional email only counts and reaches users who have not opted out', async () => {
      db.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(3);
      db.broadcast.create.mockResolvedValue({ id: 'b4' });
      db.user.findMany.mockResolvedValue([]);

      await send('admin1', { ...email, emailType: 'PROMOTIONAL', sendInApp: false });
      await new Promise(r => setImmediate(r));

      expect(db.broadcast.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientCount: 5, emailCount: 3 }) });
      expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ marketingOptIn: true }) }));
    });

    it('refuses an email-only promotion when everyone has opted out', async () => {
      db.user.count.mockResolvedValueOnce(4).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      await expect(send('admin1', { ...email, emailType: 'PROMOTIONAL', sendInApp: false })).rejects.toThrow('opted out');
      expect(db.broadcast.create).not.toHaveBeenCalled();
    });
  });

  describe('email html', () => {
    it('escapes the message and greets by first name', () => {
      const html = broadcastEmailHtml('<b>Hi</b>', 'a & b', 'Ada Obi', 'SERVICE', 'u1');
      expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
      expect(html).toContain('a &amp; b');
      expect(html).toContain('Hi Ada,');
    });

    it('only a promotion carries an unsubscribe link', () => {
      expect(broadcastEmailHtml('T', 'x', 'Ada', 'SERVICE', 'u1')).not.toContain('unsubscribe');
      expect(broadcastEmailHtml('T', 'x', 'Ada', 'PROMOTIONAL', 'u1')).toContain('/unsubscribe?t=');
    });
  });

  describe('to one user', () => {
    const one = { title: 'About your order', body: 'We refunded it', audience: 'USER' as const, targetUserId: 'u9' };

    it('needs a target user', async () => {
      await expect(send('admin1', { ...one, targetUserId: undefined })).rejects.toBeInstanceOf(BroadcastError);
      expect(db.broadcast.create).not.toHaveBeenCalled();
    });

    it('says so when the user cannot be messaged', async () => {
      db.user.count.mockResolvedValue(0);
      await expect(send('admin1', one)).rejects.toThrow('That user cannot be messaged');
      expect(db.broadcast.create).not.toHaveBeenCalled();
    });

    it('records the target and notifies only that account', async () => {
      db.user.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      db.broadcast.create.mockResolvedValue({ id: 'b2' });
      db.user.findMany.mockResolvedValue([{ id: 'u9', pushToken: 'ExponentPushToken[z]', pushSubscriptions: [] }]);

      await send('admin1', one);
      await new Promise(r => setImmediate(r));

      expect(db.broadcast.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ audience: 'USER', targetUserId: 'u9', recipientCount: 1 }),
      });
      expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'u9' }) }));
      expect(db.notification.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ userId: 'u9' })]);
    });
  });
});
