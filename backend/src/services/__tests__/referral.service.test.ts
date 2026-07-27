// Verifies the two-sided referral reward: activating a referee's first paid order grants a
// free-delivery credit to BOTH the referrer and the referee, exactly once (idempotent).

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    referral: { findUnique: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../notification.service', () => ({ notifyUser: jest.fn().mockResolvedValue(undefined) }));

import prisma from '../../config/db';
import { activateReferral } from '../referral.service';

const mockPrisma = prisma as unknown as {
  referral: { findUnique: jest.Mock; update: jest.Mock };
  user: { update: jest.Mock };
  $transaction: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe('activateReferral (two-sided reward)', () => {
  it('credits both the referrer and the referee on first activation', async () => {
    mockPrisma.referral.findUnique.mockResolvedValue({
      referrerId: 'referrer-1',
      refereeId: 'referee-1',
      isActive: false,
    });

    await activateReferral('referee-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Referral is marked active + awarded.
    expect(mockPrisma.referral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { refereeId: 'referee-1' },
        data: expect.objectContaining({ isActive: true, creditAwarded: true }),
      }),
    );
    // Both users get +1 credit.
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'referrer-1' },
      data: { freeDeliveryCredits: { increment: 1 } },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'referee-1' },
      data: { freeDeliveryCredits: { increment: 1 } },
    });
  });

  it('does nothing when the referral is already active (idempotent)', async () => {
    mockPrisma.referral.findUnique.mockResolvedValue({
      referrerId: 'referrer-1',
      refereeId: 'referee-1',
      isActive: true,
    });

    await activateReferral('referee-1');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when there is no referral for the user', async () => {
    mockPrisma.referral.findUnique.mockResolvedValue(null);

    await activateReferral('referee-1');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
