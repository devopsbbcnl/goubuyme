// Which location a vendor request acts on, and who may reach owner-only areas.

jest.mock('../../config/db', () => ({ __esModule: true, default: { vendor: { findFirst: jest.fn() } } }));

import prisma from '../../config/db';
import { actingVendorWhere, requireOwner, vendorContext } from '../vendorContext';

const findFirst = (prisma as unknown as { vendor: { findFirst: jest.Mock } }).vendor.findFirst;

function run(handler: any, opts: { userId?: string; header?: string } = {}) {
  const req: any = { user: { userId: opts.userId ?? 'u1', role: 'VENDOR' }, headers: opts.header ? { 'x-vendor-id': opts.header } : {} };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return handler(req, res, next).then(() => ({ req, res, next }));
}

beforeEach(() => jest.resetAllMocks());

describe('vendorContext: owner', () => {
  it('defaults to the main business when no location is chosen', async () => {
    findFirst.mockResolvedValueOnce(null); // not a manager
    const { req, next } = await run(vendorContext);
    expect(next).toHaveBeenCalledWith();
    expect(req.vendorId).toBeUndefined();
    expect(actingVendorWhere(req)).toEqual({ userId: 'u1', parentVendorId: null });
  });

  it('acts on a chosen location they own', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'branch-1' });
    const { req, next } = await run(vendorContext, { header: 'branch-1' });
    expect(next).toHaveBeenCalledWith();
    expect(req.vendorId).toBe('branch-1');
    expect(findFirst).toHaveBeenLastCalledWith({ where: { id: 'branch-1', userId: 'u1' }, select: { id: true } });
    expect(actingVendorWhere(req)).toEqual({ id: 'branch-1' });
  });

  it("refuses a location that is not theirs (403)", async () => {
    findFirst.mockResolvedValue(null);
    const { res, next } = await run(vendorContext, { header: 'someone-elses' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('vendorContext: branch manager', () => {
  it('always acts on their own branch, with no header needed', async () => {
    findFirst.mockResolvedValueOnce({ id: 'branch-1' });
    const { req, next } = await run(vendorContext);
    expect(req.vendorId).toBe('branch-1');
    expect(req.isBranchManager).toBe(true);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts the header when it names their own branch', async () => {
    findFirst.mockResolvedValueOnce({ id: 'branch-1' });
    const { req, next } = await run(vendorContext, { header: 'branch-1' });
    expect(req.vendorId).toBe('branch-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('refuses any other location, including the main business (403)', async () => {
    findFirst.mockResolvedValueOnce({ id: 'branch-1' });
    const { res, next } = await run(vendorContext, { header: 'main-1' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('vendorContext: disabled branch manager', () => {
  it('is refused immediately even with a still-valid access token (403)', async () => {
    findFirst.mockResolvedValueOnce({ id: 'branch-1', manager: { isActive: false } });
    const { res, next } = await run(vendorContext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireOwner', () => {
  it('lets an owner through', async () => {
    findFirst.mockResolvedValueOnce(null);
    const { next } = await run(requireOwner);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks a branch manager from owner-only areas (403)', async () => {
    findFirst.mockResolvedValueOnce({ id: 'branch-1' });
    const { res, next } = await run(requireOwner);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
