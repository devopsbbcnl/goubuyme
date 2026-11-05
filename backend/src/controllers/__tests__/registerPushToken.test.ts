// A push token belongs to one account at a time, so a branch manager's phone only gets their alerts.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    user: { update: jest.fn((a: unknown) => a), updateMany: jest.fn((a: unknown) => a) },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));

import prisma from '../../config/db';
import { registerPushToken } from '../notification.controller';

const db = prisma as unknown as {
  user: { update: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const call = (token?: string) => {
  const req: any = { user: { userId: 'manager-1' }, body: { token } };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return new Promise<{ res: any }>((resolve) => {
    registerPushToken(req, res, (() => {}) as any);
    setTimeout(() => resolve({ res }), 20);
  });
};

beforeEach(() => jest.clearAllMocks());

describe('registerPushToken', () => {
  it('releases the token from any other account before assigning it', async () => {
    await call('ExponentPushToken[abc]');
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { pushToken: 'ExponentPushToken[abc]', id: { not: 'manager-1' } },
      data: { pushToken: null },
    });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'manager-1' }, data: { pushToken: 'ExponentPushToken[abc]' } });
    // both writes happen together, release first
    const [first, second] = db.$transaction.mock.calls[0][0];
    expect(first).toEqual(db.user.updateMany.mock.results[0].value);
    expect(second).toEqual(db.user.update.mock.results[0].value);
  });

  it('rejects a missing token without touching anything', async () => {
    const { res } = await call(undefined);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
