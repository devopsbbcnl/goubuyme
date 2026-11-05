import { Response } from 'express';
import { OrderStatus } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { deletedVendorName } from '../utils/deletedVendorName';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  BranchError,
  BranchInput,
  MAX_BRANCHES,
  branchBusinessName,
  copyMenu,
  createBranchVendor,
} from '../services/branch.service';
import {
  createManagerLogin,
  parseManagerInput,
  resetManagerPassword,
  revokeManagerLogin,
  updateManagerLogin,
} from '../services/branchAccess.service';

const PHONE_RE = /^\+?[0-9]{10,15}$/;
const TERMINAL: OrderStatus[] = [OrderStatus.DELIVERED, OrderStatus.CANCELLED];

/** What the owner sees for a location. Full management happens by switching into it. */
const locationSelect = {
  id: true, businessName: true, branchLabel: true, address: true, city: true, state: true,
  latitude: true, longitude: true, contactPhone: true,
  approvalStatus: true, isOpen: true, rating: true, totalRatings: true, createdAt: true,
  notifyOwnerOfOrders: true,
  manager: { select: { id: true, name: true, email: true, phone: true, isActive: true, pushToken: true, createdAt: true } },
  _count: { select: { menuItems: true } },
} as const;

type LocationRow = {
  manager: { id: string; name: string; email: string; phone: string | null; isActive: boolean; pushToken: string | null; createdAt: Date } | null;
} & Record<string, unknown>;

/** Never expose the raw device token; the owner only needs to know whether a device is registered. */
function shape<T extends LocationRow>(row: T) {
  const { manager, ...rest } = row;
  return {
    ...rest,
    manager: manager
      ? {
          id: manager.id, name: manager.name, email: manager.email, phone: manager.phone,
          isActive: manager.isActive, hasDevice: !!manager.pushToken, createdAt: manager.createdAt,
        }
      : null,
  };
}

/** Branch management always acts on the account's main business, never on a selected branch. */
const resolveMain = (userId: string) =>
  prisma.vendor.findFirst({ where: { userId, parentVendorId: null } });

function parseBranch(body: Record<string, unknown>, partial: boolean): { data: Partial<BranchInput>; error?: string } {
  const data: Partial<BranchInput> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

  for (const [key, label, min, max] of [
    ['name', 'Branch name', 2, 60],
    ['address', 'Address', 3, 250],
    ['city', 'City', 2, 100],
  ] as const) {
    const v = str(body[key]);
    if (v === undefined) {
      if (!partial) return { data, error: `${label} is required.` };
      continue;
    }
    if (v.length < min || v.length > max) return { data, error: `${label} must be ${min} to ${max} characters.` };
    data[key] = v;
  }

  const state = str(body.state);
  if (state) data.state = state.slice(0, 100);

  const phone = str(body.phone);
  if (phone !== undefined) {
    if (phone && !PHONE_RE.test(phone)) return { data, error: 'Enter a valid branch phone number.' };
    data.phone = phone || null;
  }

  for (const [key, lo, hi] of [['latitude', -90, 90], ['longitude', -180, 180]] as const) {
    const v = body[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return { data, error: `Invalid ${key}.` };
    data[key] = v;
  }

  return { data };
}

const failure = (res: Response, err: unknown) => {
  if (err instanceof BranchError) return apiResponse.error(res, err.message, err.status);
  throw err;
};

// GET /vendors/me/branches
export const listMyBranches = catchAsync(async (req: AuthRequest, res: Response) => {
  const main = await resolveMain(req.user!.userId);
  if (!main) return apiResponse.error(res, 'Vendor not found.', 404);

  const [mainRow, branches] = await Promise.all([
    prisma.vendor.findUnique({ where: { id: main.id }, select: locationSelect }),
    prisma.vendor.findMany({ where: { parentVendorId: main.id }, orderBy: { createdAt: 'asc' }, select: locationSelect }),
  ]);

  return apiResponse.success(res, 'Locations fetched.', {
    main: mainRow ? shape(mainRow) : null,
    branches: branches.map(shape),
    max: MAX_BRANCHES,
  });
});

// POST /vendors/me/branches
//   { name, address, city, state?, latitude?, longitude?, phone?, copyMenu?, manager?: { name, email, phone?, password? } }
export const createBranch = catchAsync(async (req: AuthRequest, res: Response) => {
  const main = await resolveMain(req.user!.userId);
  if (!main) return apiResponse.error(res, 'Vendor not found.', 404);

  const { data, error } = parseBranch(req.body ?? {}, false);
  if (error) return apiResponse.error(res, error, 400);

  let manager: ReturnType<typeof parseManagerInput>['data'] | null = null;
  if (req.body?.manager) {
    const parsed = parseManagerInput(req.body.manager);
    if (parsed.error) return apiResponse.error(res, parsed.error, 400);
    manager = parsed.data;
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const branch = await createBranchVendor(tx, main, data as BranchInput);
      const copied = req.body?.copyMenu === true ? await copyMenu(tx, main.id, branch.id) : 0;
      const login = manager
        ? await createManagerLogin(tx, req.user!.userId, branch.id, manager as Required<Pick<typeof manager, 'name' | 'email'>> & typeof manager)
        : null;
      return { branch, copied, login };
    });
    const row = await prisma.vendor.findUnique({ where: { id: created.branch.id }, select: locationSelect });
    return apiResponse.success(
      res,
      'Branch added.',
      {
        ...(row ? shape(row) : {}),
        copiedMenuItems: created.copied,
        // Shown once so the owner can hand it over; it is never stored or returned again.
        login: created.login ? { email: created.login.email, temporaryPassword: created.login.temporaryPassword } : null,
      },
      201,
    );
  } catch (err) {
    return failure(res, err);
  }
});

// PATCH /vendors/me/branches/:id   (location details only; everything else is edited by switching into the branch)
export const updateBranch = catchAsync(async (req: AuthRequest, res: Response) => {
  const main = await resolveMain(req.user!.userId);
  if (!main) return apiResponse.error(res, 'Vendor not found.', 404);

  const branch = await prisma.vendor.findFirst({
    where: { id: req.params.id, parentVendorId: main.id },
    select: { id: true },
  });
  if (!branch) return apiResponse.error(res, 'Branch not found.', 404);

  const { data, error } = parseBranch(req.body ?? {}, true);
  if (error) return apiResponse.error(res, error, 400);

  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const businessName = branchBusinessName(main.businessName, data.name);
    const clash = await prisma.vendor.findFirst({
      where: { businessName: { equals: businessName, mode: 'insensitive' }, id: { not: branch.id } },
      select: { id: true },
    });
    if (clash) return apiResponse.error(res, `You already have a location called "${data.name}". Choose a different name.`, 409);
    patch.branchLabel = data.name;
    patch.businessName = businessName;
  }
  if (data.address !== undefined) patch.address = data.address;
  if (data.city !== undefined) patch.city = data.city;
  if (data.state !== undefined) patch.state = data.state;
  if (data.latitude !== undefined) patch.latitude = data.latitude;
  if (data.longitude !== undefined) patch.longitude = data.longitude;
  if (data.phone !== undefined) patch.contactPhone = data.phone;
  if (typeof req.body?.notifyOwnerOfOrders === 'boolean') patch.notifyOwnerOfOrders = req.body.notifyOwnerOfOrders;
  if (Object.keys(patch).length === 0) return apiResponse.error(res, 'No fields to update.', 400);

  await prisma.vendor.update({ where: { id: branch.id }, data: patch });
  const row = await prisma.vendor.findUnique({ where: { id: branch.id }, select: locationSelect });
  return apiResponse.success(res, 'Branch updated.', row ? shape(row) : null);
});

// DELETE /vendors/me/branches/:id
export const deleteBranch = catchAsync(async (req: AuthRequest, res: Response) => {
  const main = await resolveMain(req.user!.userId);
  if (!main) return apiResponse.error(res, 'Vendor not found.', 404);

  const branch = await prisma.vendor.findFirst({
    where: { id: req.params.id, parentVendorId: main.id },
    select: { id: true, businessName: true },
  });
  if (!branch) return apiResponse.error(res, 'Branch not found.', 404);

  const active = await prisma.order.findFirst({
    where: { vendorId: branch.id, status: { notIn: TERMINAL } },
    select: { orderNumber: true },
  });
  if (active) {
    return apiResponse.error(res, `This branch has an order in progress (#${active.orderNumber}). Remove it once that is done.`, 409);
  }

  const hasHistory = await prisma.order.count({ where: { vendorId: branch.id } });
  try {
    await prisma.$transaction(async (tx) => {
      // The manager's login goes with the branch, so nobody keeps access to a removed location.
      await revokeManagerLogin(tx, req.user!.userId, branch.id);
      if (hasHistory > 0) {
        // Orders, earnings and payouts reference the branch, so keep the row but take it off the
        // platform: hidden from customers, closed, and its name freed up for a future branch.
        await tx.vendor.update({
          where: { id: branch.id },
          data: { approvalStatus: 'SUSPENDED', isOpen: false, businessName: deletedVendorName(branch.businessName, branch.id) },
        });
      } else {
        await tx.vendor.delete({ where: { id: branch.id } });
      }
    });
  } catch (err) {
    return failure(res, err);
  }
  return apiResponse.success(res, hasHistory > 0 ? 'Branch removed. Its order history is kept.' : 'Branch removed.');
});

// ── Branch manager login ──────────────────────────────────────────────────────

// POST /vendors/me/branches/:id/login   { name, email, phone?, password? }
export const createBranchLogin = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = parseManagerInput(req.body);
  if (parsed.error) return apiResponse.error(res, parsed.error, 400);
  try {
    const login = await prisma.$transaction((tx) =>
      createManagerLogin(tx, req.user!.userId, req.params.id, parsed.data as Parameters<typeof createManagerLogin>[3]),
    );
    return apiResponse.success(
      res,
      'Branch login created. Share these details with the manager.',
      { email: login.email, temporaryPassword: login.temporaryPassword },
      201,
    );
  } catch (err) {
    return failure(res, err);
  }
});

// PATCH /vendors/me/branches/:id/login   { name?, email?, phone?, isActive? }
export const updateBranchLogin = catchAsync(async (req: AuthRequest, res: Response) => {
  const parsed = parseManagerInput(req.body, true);
  if (parsed.error) return apiResponse.error(res, parsed.error, 400);
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;
  try {
    await updateManagerLogin(req.user!.userId, req.params.id, { ...parsed.data, ...(isActive !== undefined ? { isActive } : {}) });
    return apiResponse.success(res, isActive === false ? 'Branch login disabled.' : 'Branch login updated.');
  } catch (err) {
    return failure(res, err);
  }
});

// POST /vendors/me/branches/:id/login/reset-password
export const resetBranchLoginPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const temporaryPassword = await resetManagerPassword(req.user!.userId, req.params.id);
    return apiResponse.success(res, 'Password reset. The manager has been signed out everywhere.', { temporaryPassword });
  } catch (err) {
    return failure(res, err);
  }
});

// DELETE /vendors/me/branches/:id/login
export const revokeBranchLogin = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    await prisma.$transaction((tx) => revokeManagerLogin(tx, req.user!.userId, req.params.id));
    return apiResponse.success(res, 'Branch login removed. The branch is now run from your account.');
  } catch (err) {
    return failure(res, err);
  }
});
