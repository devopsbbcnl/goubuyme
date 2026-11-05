// Sign-in events reach the SMOIS trail only for people who use the workspace, and never break login.
jest.mock('../../../config/db', () => ({
  __esModule: true,
  default: {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    smoisMember: { findUnique: jest.fn() },
  },
}));

import prisma from '../../../config/db';
import { recordSmoisAuthEvent } from '../audit';

const db = prisma as unknown as { auditLog: { create: jest.Mock }; smoisMember: { findUnique: jest.Mock } };
const req = { ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };

beforeEach(() => { jest.clearAllMocks(); db.auditLog.create.mockResolvedValue({}); });

describe('recordSmoisAuthEvent', () => {
  it('ignores customers, vendors and riders entirely', async () => {
    for (const role of ['CUSTOMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY']) {
      await recordSmoisAuthEvent(req, { id: 'u', role }, 'AUTH_LOGIN');
    }
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.smoisMember.findUnique).not.toHaveBeenCalled();
  });

  it('records super admin and social media staff sign-ins against their own user', async () => {
    await recordSmoisAuthEvent(req, { id: 'u1', role: 'SUPER_ADMIN' }, 'AUTH_LOGIN');
    await recordSmoisAuthEvent(req, { id: 'u2', role: 'SOCIAL_MEDIA' }, 'AUTH_LOGOUT');
    expect(db.auditLog.create).toHaveBeenCalledTimes(2);
    const first = db.auditLog.create.mock.calls[0][0].data;
    expect(first).toMatchObject({ userId: 'u1', action: 'AUTH_LOGIN', entity: 'SmoisAuth', entityId: 'u1', ip: '10.0.0.1' });
    expect(first.meta.success).toBe(true);
  });

  it('records an operations admin only if they were given workspace access', async () => {
    db.smoisMember.findUnique.mockResolvedValueOnce(null);
    await recordSmoisAuthEvent(req, { id: 'ops', role: 'OPERATIONS_ADMIN' }, 'AUTH_LOGIN');
    expect(db.auditLog.create).not.toHaveBeenCalled();

    db.smoisMember.findUnique.mockResolvedValueOnce({ isActive: true });
    await recordSmoisAuthEvent(req, { id: 'ops', role: 'OPERATIONS_ADMIN' }, 'AUTH_LOGIN');
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('marks a failed sign-in as unsuccessful and keeps the reason', async () => {
    await recordSmoisAuthEvent(req, { id: 'u2', role: 'SOCIAL_MEDIA' }, 'AUTH_LOGIN_FAILED', { reason: 'invalid_password' });
    const data = db.auditLog.create.mock.calls[0][0].data;
    expect(data.meta).toMatchObject({ success: false, reason: 'invalid_password' });
  });

  it('never throws, even when the audit write or lookup fails', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(recordSmoisAuthEvent(req, { id: 'u1', role: 'SUPER_ADMIN' }, 'AUTH_LOGIN')).resolves.toBeUndefined();
    db.smoisMember.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(recordSmoisAuthEvent(req, { id: 'o', role: 'SUPPORT_ADMIN' }, 'AUTH_LOGIN')).resolves.toBeUndefined();
  });
});
