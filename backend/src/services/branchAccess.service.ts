import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { generateReferralCode } from '../utils/generateToken';
import { BranchError } from './branch.service';

const SALT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{10,15}$/;

type Tx = Prisma.TransactionClient;

/** Same strength rules as signup, so a branch login is no weaker than any other account. */
export const isStrongPassword = (p: string): boolean =>
  p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);

/**
 * A readable temporary password that always passes `isStrongPassword`. Ambiguous characters
 * (0/O, 1/l/I) are left out because it gets read out or typed from a handover note.
 */
export function generateTempPassword(): string {
  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(lower), pick(digits), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export interface ManagerInput {
  name: string;
  email: string;
  phone?: string | null;
  /** Optional: when omitted a strong temporary password is generated and returned once. */
  password?: string | null;
}

/** Validate manager details from a request body. Returns a clean value or a user-facing error. */
export function parseManagerInput(body: unknown, partial = false): { data: Partial<ManagerInput>; error?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const data: Partial<ManagerInput> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

  const name = str(b.name);
  if (name === undefined) {
    if (!partial) return { data, error: 'Enter the manager\'s name.' };
  } else {
    if (name.length < 2 || name.length > 100) return { data, error: 'The manager\'s name must be 2 to 100 characters.' };
    data.name = name;
  }

  const email = str(b.email);
  if (email === undefined) {
    if (!partial) return { data, error: 'Enter the email the manager will sign in with.' };
  } else {
    if (!EMAIL_RE.test(email) || email.length > 254) return { data, error: 'Enter a valid email address.' };
    data.email = email.toLowerCase();
  }

  const phone = str(b.phone);
  if (phone !== undefined) {
    if (phone && !PHONE_RE.test(phone)) return { data, error: 'Enter a valid phone number, digits only, e.g. 08031234567.' };
    data.phone = phone || null;
  }

  const password = str(b.password);
  if (password) {
    if (!isStrongPassword(password)) {
      return { data, error: 'Password needs 8+ characters with upper and lower case letters, a number and a symbol. Leave it blank to generate one.' };
    }
    data.password = password;
  }

  return { data };
}

/** The branch must belong to this owner's main business. */
async function ownedBranch(tx: Tx, ownerUserId: string, branchId: string) {
  const branch = await tx.vendor.findFirst({
    where: { id: branchId, parentVendorId: { not: null }, parent: { userId: ownerUserId } },
    select: { id: true, businessName: true, managerUserId: true },
  });
  if (!branch) throw new BranchError('Branch not found.', 404);
  return branch;
}

async function assertContactFree(tx: Tx, email?: string, phone?: string | null, exceptUserId?: string) {
  if (email) {
    const taken = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { id: true },
    });
    if (taken) throw new BranchError('That email is already registered. Use a different one for this manager.', 409);
  }
  if (phone) {
    const taken = await tx.user.findFirst({
      where: { phone, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
      select: { id: true },
    });
    if (taken) throw new BranchError('That phone number is already linked to another account.', 409);
  }
}

/**
 * Create the branch manager's own login. The account is a normal vendor-role user, already
 * email-verified because the owner vouches for it, so the manager can sign in straight away on
 * their own device and receive that branch's push notifications there.
 *
 * Returns the temporary password ONCE (the caller shows it for handover); it is never stored in
 * clear text.
 */
export async function createManagerLogin(
  tx: Tx,
  ownerUserId: string,
  branchId: string,
  input: ManagerInput,
): Promise<{ managerUserId: string; email: string; temporaryPassword: string | null }> {
  const branch = await ownedBranch(tx, ownerUserId, branchId);
  if (branch.managerUserId) throw new BranchError('This branch already has a login. Reset its password instead.', 409);

  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;
  await assertContactFree(tx, email, phone);

  const generated = input.password ? null : generateTempPassword();
  const password = await bcrypt.hash(input.password || generated!, SALT_ROUNDS);

  const user = await tx.user.create({
    data: {
      name: input.name.trim(),
      email,
      password,
      role: 'VENDOR',
      referralCode: generateReferralCode(),
      isEmailVerified: true,
      ...(phone ? { phone } : {}),
    },
    select: { id: true },
  });
  await tx.vendor.update({ where: { id: branch.id }, data: { managerUserId: user.id } });
  await tx.auditLog.create({
    data: { userId: ownerUserId, action: 'BRANCH_LOGIN_CREATED', entity: 'Vendor', entityId: branch.id, meta: { managerUserId: user.id } },
  });

  return { managerUserId: user.id, email, temporaryPassword: generated };
}

/** Change the manager's name, email or phone, or switch their access off and on. */
export async function updateManagerLogin(
  ownerUserId: string,
  branchId: string,
  patch: Partial<ManagerInput> & { isActive?: boolean },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const branch = await ownedBranch(tx, ownerUserId, branchId);
    if (!branch.managerUserId) throw new BranchError('This branch has no login yet.', 404);

    await assertContactFree(tx, patch.email, patch.phone ?? undefined, branch.managerUserId);

    const data: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.email !== undefined) data.email = patch.email;
    if (patch.phone !== undefined) data.phone = patch.phone;
    if (patch.isActive !== undefined) {
      data.isActive = patch.isActive;
      // Switching access off ends any session already signed in on a device.
      if (!patch.isActive) data.refreshToken = null;
    }
    if (Object.keys(data).length === 0) throw new BranchError('Nothing to update.', 400);

    await tx.user.update({ where: { id: branch.managerUserId }, data });
    await tx.auditLog.create({
      data: {
        userId: ownerUserId, action: patch.isActive === false ? 'BRANCH_LOGIN_DISABLED' : 'BRANCH_LOGIN_UPDATED',
        entity: 'Vendor', entityId: branch.id,
      },
    });
  });
}

/** Issue a new temporary password and sign the manager out everywhere. Returned once. */
export async function resetManagerPassword(ownerUserId: string, branchId: string): Promise<string> {
  const temporaryPassword = generateTempPassword();
  const hashed = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    const branch = await ownedBranch(tx, ownerUserId, branchId);
    if (!branch.managerUserId) throw new BranchError('This branch has no login yet.', 404);
    await tx.user.update({
      where: { id: branch.managerUserId },
      data: { password: hashed, refreshToken: null, passwordResetToken: null, passwordResetExpiresAt: null },
    });
    await tx.auditLog.create({
      data: { userId: ownerUserId, action: 'BRANCH_LOGIN_PASSWORD_RESET', entity: 'Vendor', entityId: branch.id },
    });
  });
  return temporaryPassword;
}

/**
 * Take the manager's access away for good: the account is closed (and its devices unregistered),
 * and the branch goes back to being run by the owner. The email is freed for reuse.
 */
export async function revokeManagerLogin(tx: Tx, ownerUserId: string, branchId: string): Promise<void> {
  const branch = await ownedBranch(tx, ownerUserId, branchId);
  if (!branch.managerUserId) return;
  const managerId = branch.managerUserId;

  await tx.vendor.update({ where: { id: branch.id }, data: { managerUserId: null } });
  await tx.user.update({
    where: { id: managerId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      email: `deleted-${managerId}@deleted.gobuyme.local`,
      googleId: null,
      phone: null,
      refreshToken: null,
      pushToken: null,
      analyticsOptIn: false,
    },
  });
  await tx.pushSubscription.deleteMany({ where: { userId: managerId } });
  await tx.auditLog.create({
    data: { userId: ownerUserId, action: 'BRANCH_LOGIN_REVOKED', entity: 'Vendor', entityId: branch.id, meta: { managerUserId: managerId } },
  });
}
