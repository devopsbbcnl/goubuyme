// In-app alerts always go out; the email copy respects each person's switch and the per-event opt-out.
jest.mock('../../../config/db', () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn() },
    smoisPreference: { findMany: jest.fn() },
  },
}));
jest.mock('../../../services/notification.service', () => ({ notifyUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../services/email.service', () => ({ sendSmoisAlertEmail: jest.fn().mockResolvedValue(undefined) }));

import prisma from '../../../config/db';
import { notifyUser } from '../../../services/notification.service';
import { sendSmoisAlertEmail } from '../../../services/email.service';
import { notifyMany } from '../common';

const db = prisma as unknown as { user: { findMany: jest.Mock }; smoisPreference: { findMany: jest.Mock } };
const push = notifyUser as jest.Mock;
const mail = sendSmoisAlertEmail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findMany.mockResolvedValue([
    { id: 'a', name: 'Ada', email: 'ada@x.com' },
    { id: 'b', name: 'Bayo', email: 'bayo@x.com' },
  ]);
  db.smoisPreference.findMany.mockResolvedValue([]);
});

describe('notifyMany', () => {
  it('alerts everyone in-app, skips the person who acted, and de-duplicates', async () => {
    await notifyMany(['a', 'b', 'a', null, undefined, 'actor'], { title: 'T', body: 'B' }, 'actor');
    expect(push.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b']);
    expect(push.mock.calls[0][1]).toMatchObject({ type: 'smois', title: 'T' });
  });

  it('sends an email copy to people who have not switched it off', async () => {
    await notifyMany(['a', 'b'], { title: 'Content to review', body: 'Weekend promo', data: { link: '/smois/approvals' } });
    expect(mail).toHaveBeenCalledTimes(2);
    expect(mail).toHaveBeenCalledWith('ada@x.com', 'Ada', 'Content to review', 'Weekend promo', '/smois/approvals');
  });

  it('keeps the in-app alert but drops the email for anyone who opted out', async () => {
    db.smoisPreference.findMany.mockResolvedValue([{ userId: 'b', emailAlerts: false }, { userId: 'a', emailAlerts: true }]);
    await notifyMany(['a', 'b'], { title: 'T', body: 'B' });
    expect(push).toHaveBeenCalledTimes(2);
    expect(mail.mock.calls.map((c) => c[0])).toEqual(['ada@x.com']);
  });

  it('sends no email for chatty events flagged email:false', async () => {
    await notifyMany(['a'], { title: 'New comment', body: 'x', email: false });
    expect(push).toHaveBeenCalledTimes(1);
    expect(mail).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('does nothing when there is nobody to tell', async () => {
    await notifyMany(['actor', null], { title: 'T', body: 'B' }, 'actor');
    expect(push).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('a failing email lookup never breaks the action that triggered it', async () => {
    db.user.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(notifyMany(['a'], { title: 'T', body: 'B' })).resolves.toBeUndefined();
    expect(push).toHaveBeenCalledTimes(1);
  });
});
