// Fleet standing rules: a fleet rider is only as good as their company, an admin's
// REJECTED/SUSPENDED decision always wins, and fleet invites are claimed exactly once.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    rider: { findUnique: jest.fn(), update: jest.fn() },
    fleetInvite: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from '../../config/db';
import { claimFleetInvite, effectiveRiderApproval, removeRiderFromFleet } from '../fleet.service';

const db = prisma as unknown as {
  rider: { findUnique: jest.Mock; update: jest.Mock };
  fleetInvite: { findFirst: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe('effectiveRiderApproval', () => {
  it('returns the rider status unchanged when not APPROVED', () => {
    expect(effectiveRiderApproval({ approvalStatus: 'PENDING' })).toBe('PENDING');
    expect(effectiveRiderApproval({ approvalStatus: 'REJECTED', company: { approvalStatus: 'APPROVED' } })).toBe('REJECTED');
    expect(effectiveRiderApproval({ approvalStatus: 'SUSPENDED', company: { approvalStatus: 'APPROVED' } })).toBe('SUSPENDED');
  });

  it('keeps an independent approved rider approved', () => {
    expect(effectiveRiderApproval({ approvalStatus: 'APPROVED', companyId: null })).toBe('APPROVED');
  });

  it('follows the company for fleet riders', () => {
    const rider = { approvalStatus: 'APPROVED' as const, companyId: 'c1', approvedViaCompany: true };
    expect(effectiveRiderApproval({ ...rider, company: { approvalStatus: 'APPROVED' } })).toBe('APPROVED');
    expect(effectiveRiderApproval({ ...rider, company: { approvalStatus: 'SUSPENDED' } })).toBe('PENDING');
    expect(effectiveRiderApproval({ ...rider, company: { approvalStatus: 'REJECTED' } })).toBe('PENDING');
    expect(effectiveRiderApproval({ ...rider, company: { approvalStatus: 'PENDING' } })).toBe('PENDING');
  });

  it('does not keep a rider approved only by a company that no longer exists', () => {
    expect(effectiveRiderApproval({ approvalStatus: 'APPROVED', companyId: null, approvedViaCompany: true })).toBe('PENDING');
  });
});

describe('claimFleetInvite', () => {
  const user = { id: 'u1', email: 'Rider@Example.com' };
  const invite = { id: 'i1', companyId: 'c1' };

  it('does nothing when the user has no rider profile', async () => {
    db.rider.findUnique.mockResolvedValue(null);
    expect(await claimFleetInvite(user)).toBe(false);
    expect(db.fleetInvite.findFirst).not.toHaveBeenCalled();
  });

  it.each(['REJECTED', 'SUSPENDED'])('never pulls a %s rider into a fleet', async (approvalStatus) => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus, companyId: null });
    expect(await claimFleetInvite(user)).toBe(false);
    expect(db.fleetInvite.findFirst).not.toHaveBeenCalled();
  });

  it('only looks for live invites from an approved company, matching email case-insensitively', async () => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(null);
    expect(await claimFleetInvite(user)).toBe(false);
    const where = db.fleetInvite.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('INVITED');
    expect(where.company).toEqual({ approvalStatus: 'APPROVED' });
    expect(where.email).toEqual({ equals: 'Rider@Example.com', mode: 'insensitive' });
  });

  it('leaves a rider who is already in another fleet alone', async () => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus: 'APPROVED', companyId: 'other' });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    expect(await claimFleetInvite(user)).toBe(false);
    expect(db.rider.update).not.toHaveBeenCalled();
  });

  it('approves a PENDING rider by joining', async () => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    db.fleetInvite.updateMany.mockResolvedValue({ count: 1 });
    expect(await claimFleetInvite(user)).toBe(true);
    expect(db.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { companyId: 'c1', approvalStatus: 'APPROVED', approvedViaCompany: true },
    });
  });

  it('only links an already approved independent rider', async () => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus: 'APPROVED', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    db.fleetInvite.updateMany.mockResolvedValue({ count: 1 });
    expect(await claimFleetInvite(user)).toBe(true);
    expect(db.rider.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { companyId: 'c1' } });
  });

  it('loses the race cleanly when the invite was already claimed', async () => {
    db.rider.findUnique.mockResolvedValue({ id: 'r1', approvalStatus: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    db.fleetInvite.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimFleetInvite(user)).toBe(false);
    expect(db.rider.update).not.toHaveBeenCalled();
  });
});

describe('removeRiderFromFleet', () => {
  it('sends a rider approved only by joining back to PENDING and offline', async () => {
    db.rider.findUnique.mockResolvedValue({ approvedViaCompany: true });
    await removeRiderFromFleet('r1');
    expect(db.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { companyId: null, approvedViaCompany: false, approvalStatus: 'PENDING', isOnline: false, isAvailable: false },
    });
  });

  it('keeps an independently approved rider approved', async () => {
    db.rider.findUnique.mockResolvedValue({ approvedViaCompany: false });
    await removeRiderFromFleet('r1');
    expect(db.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { companyId: null, approvedViaCompany: false },
    });
  });
});
