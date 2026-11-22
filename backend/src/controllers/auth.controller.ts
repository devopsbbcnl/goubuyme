import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { nextImagePosition, parseImagePosition } from '../utils/imagePosition';
import { catchAsync } from '../utils/catchAsync';
import {
  generateAccessToken,
  generateRefreshToken,
  generateReferralCode,
  generateSocketTicket,
  hashRefreshToken,
  refreshTokenMatches,
} from '../utils/generateToken';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service';
import { recordOnboardingEvent } from '../services/onboarding.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { Role, CommissionTier, VendorCategory, OrderStatus } from '@prisma/client';
import { recordError } from '../utils/recordError';
import { encryptSecret, decryptSecret } from '../utils/crypto';
import { createUploadTicket, deleteStoredImages } from '../services/kycStorage.service';
import { eraseAccountData, hashForAudit, lastFour, ErasureResult } from '../services/accountErasure.service';
import { signupConsent } from '../config/policy';
import {
  AppleAuthError, verifyAppleIdentityToken, exchangeAppleAuthorizationCode, revokeAppleRefreshToken,
} from '../services/appleAuth.service';
import { sendPhoneOtp, verifyPhoneOtp, PhoneVerificationError } from '../services/phoneVerification.service';
import { issueEmailOtp, issueEmailOtpIfAllowed, checkEmailOtp, EmailOtpError } from '../services/emailOtp.service';
import { deletedVendorName } from '../utils/deletedVendorName';
import { RIDER_APPROVAL_SELECT, claimFleetInvite, effectiveRiderApproval } from '../services/fleet.service';
import { BranchError, createBranchVendor } from '../services/branch.service';
import { revokeManagerLogin } from '../services/branchAccess.service';
import { recordSmoisAuthEvent } from '../services/smois/audit';
import {
  SWITCHABLE_ROLES, canActAs, ensureCustomerProfile, getRoleStatuses, isSwitchableAccount, resolveLoginRole,
} from '../services/roles.service';

const SALT_ROUNDS = 12;

const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
]
  .flatMap((id) => (id || '').split(','))
  .map((id) => id.trim())
  .filter(Boolean);
const googleClient = new OAuth2Client();

const buildUserPayload = (user: {
  id: string; name: string; email: string; phone: string | null; role: Role; avatar: string | null; avatarPosition?: string | null;
}) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar, avatarPosition: user.avatarPosition ?? null });

// Maps OTP service errors (cooldown, lockout, expiry) to responses; rethrows the rest.
const sendOtpError = (res: Response, err: unknown) => {
  if (err instanceof EmailOtpError || err instanceof PhoneVerificationError) {
    if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
    return apiResponse.error(res, err.message, err.status);
  }
  throw err;
};

// Emails are stored lowercase and matched case-insensitively (legacy rows may be
// mixed-case), so Google sign-in and password sign-up can't split one person into two users.
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const findUserByEmail = (email: string) =>
  prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

/**
 * The approval standing the clients gate on, per role. A fleet rider's standing
 * follows their company's (see fleet.service), and a logistics company has its own.
 */
const vendorStanding = (userId: string) =>
  prisma.vendor.findFirst({
    where: { OR: [{ userId, parentVendorId: null }, { managerUserId: userId }] },
    select: { approvalStatus: true },
  });

const resolveApprovalStatus = async (userId: string, role: Role): Promise<string | undefined> => {
  if (role === 'VENDOR') {
    const vendor = await vendorStanding(userId);
    return vendor?.approvalStatus;
  }
  if (role === 'RIDER') {
    const rider = await prisma.rider.findUnique({ where: { userId }, select: RIDER_APPROVAL_SELECT });
    return rider ? effectiveRiderApproval(rider) : undefined;
  }
  if (role === 'LOGISTICS_COMPANY') {
    const company = await prisma.logisticsCompany.findUnique({ where: { userId }, select: { approvalStatus: true } });
    return company?.approvalStatus;
  }
  return undefined;
};

interface BranchInput {
  name: string; address: string; city: string; state?: string;
  latitude?: number; longitude?: number; phone?: string;
}

export const register = catchAsync(async (req: Request, res: Response) => {
  const {
    name, phone, password, role,
    referralCode,
    commissionTier, businessName, category, address, city, state, latitude, longitude,
    vehicleType, plateNumber,
    companyName, registrationNumber, branches,
  } = req.body;
  const email = normalizeEmail(req.body.email);

  const existing = await findUserByEmail(email);
  if (existing) {
    if (!existing.isEmailVerified) {
      await issueEmailOtpIfAllowed(existing.id, existing.email, existing.name);
      return apiResponse.success(res, 'A new verification code has been sent to your email.', {
        userId: existing.id,
        email: existing.email,
        role: existing.role,
      }, 200);
    }
    return apiResponse.error(res, 'Email already registered.', 409);
  }

  if (phone?.trim()) {
    const phoneTaken = await prisma.user.findUnique({ where: { phone: phone.trim() }, select: { id: true } });
    if (phoneTaken) return apiResponse.error(res, 'This phone number is already linked to another account.', 409);
  }

  if (role === 'VENDOR' && businessName) {
    const nameTaken = await prisma.vendor.findFirst({
      where: { businessName: { equals: businessName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameTaken) return apiResponse.error(res, 'A store with this business name already exists. Please choose a different name.', 409);
  }

  if (role === 'LOGISTICS_COMPANY' && companyName) {
    const nameTaken = await prisma.logisticsCompany.findFirst({
      where: { companyName: { equals: companyName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameTaken) return apiResponse.error(res, 'A logistics company with this name already exists. Please choose a different name.', 409);
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const newReferralCode = generateReferralCode();

  let referredById: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (referrer) referredById = referrer.id;
  }

  let user: Awaited<ReturnType<typeof prisma.user.create>>;
  try {
  user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name, email, password: hashed,
        role: role as Role,
        referralCode: newReferralCode,
        referredById,
        ...(phone?.trim() ? { phone: phone.trim() } : {}),
        ...signupConsent(req.body, 'register'),
      },
    });

    if (role === 'CUSTOMER') {
      await tx.customer.create({ data: { userId: newUser.id } });
    }

    if (role === 'VENDOR') {
      const slug =
        businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
        '-' +
        newUser.id.slice(0, 6);
      const mainVendor = await tx.vendor.create({
        data: {
          userId: newUser.id,
          businessName,
          slug,
          category: category as VendorCategory,
          address,
          city,
          ...(state?.trim() ? { state: state.trim() } : {}),
          ...(latitude !== undefined ? { latitude } : {}),
          ...(longitude !== undefined ? { longitude } : {}),
          commissionTier: commissionTier as CommissionTier,
          isPharmacyFlagged: category === 'PHARMACY',
        },
      });

      // Each branch is its own vendor (own menu, stock, hours and listing) owned by this account.
      for (const b of (Array.isArray(branches) ? branches : []) as BranchInput[]) {
        await createBranchVendor(tx, mainVendor, b);
      }
    }

    if (role === 'LOGISTICS_COMPANY') {
      await tx.logisticsCompany.create({
        data: {
          userId: newUser.id,
          companyName: companyName.trim(),
          ...(registrationNumber?.trim() ? { registrationNumber: registrationNumber.trim() } : {}),
          address,
          city,
          ...(state?.trim() ? { state: state.trim() } : {}),
          ...(latitude !== undefined ? { latitude } : {}),
          ...(longitude !== undefined ? { longitude } : {}),
        },
      });
    }

    if (role === 'RIDER') {
      await tx.rider.create({
        data: {
          userId: newUser.id,
          vehicleType,
          plateNumber,
          address,
          city,
          state,
          ...(latitude !== undefined ? { latitude } : {}),
          ...(longitude !== undefined ? { longitude } : {}),
        },
      });
    }

    if (referredById) {
      await tx.referral.create({ data: { referrerId: referredById, refereeId: newUser.id } });
    }

    return newUser;
  });
  } catch (err) {
    if (err instanceof BranchError) return apiResponse.error(res, err.message, err.status);
    throw err;
  }

  await issueEmailOtpIfAllowed(user.id, user.email, user.name);

  void recordOnboardingEvent(user.id, user.role, 'SIGNED_UP');

  return apiResponse.success(res, 'Registration successful. Check your email for a verification code.', {
    userId: user.id,
    email: user.email,
    role: user.role,
  }, 201);
});

export const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const { userId, otp } = req.body;

  let otpId: string;
  try {
    otpId = await checkEmailOtp(userId, otp);
  } catch (err) {
    return sendOtpError(res, err);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true,
      vendors: { where: { parentVendorId: null }, select: { businessName: true, category: true }, take: 1 },
    },
  });

  await prisma.$transaction([
    prisma.emailOtp.update({ where: { id: otpId }, data: { used: true } }),
    prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } }),
  ]);

  if (user) {
    const mainVendor = user.vendors[0];
    void sendWelcomeEmail(user.email, user.name, user.role, mainVendor?.businessName ?? undefined, mainVendor?.category);
    void recordOnboardingEvent(user.id, user.role, 'EMAIL_VERIFIED');
    if (user.role === 'RIDER') {
      await claimFleetInvite({ id: user.id, email: user.email }).catch((err) =>
        recordError('auth', 'Fleet invite claim failed', err, { userId: user.id }),
      );
    }
  }

  return apiResponse.success(res, 'Email verified successfully.');
});

export const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.body;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  if (user.isEmailVerified) return apiResponse.error(res, 'Email is already verified.', 400);

  try {
    await issueEmailOtp(user.id, user.email, user.name);
  } catch (err) {
    return sendOtpError(res, err);
  }

  return apiResponse.success(res, 'A new verification code has been sent to your email.');
});

export const requestPasswordOtp = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);

  try {
    await issueEmailOtp(user.id, user.email, user.name);
  } catch (err) {
    return sendOtpError(res, err);
  }

  return apiResponse.success(res, 'Verification code sent to your email.');
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { password } = req.body;
  const email = normalizeEmail(req.body.email);

  const user = await findUserByEmail(email);
  if (!user || !user.password) {
    // Track failed login attempt
    const { trackSuspiciousActivity } = await import('../services/auto-blocker.service');
    await trackSuspiciousActivity(req.ip || '', 'failed_login', { email, reason: 'user_not_found' });
    return apiResponse.error(res, 'No account found with this email address.', 404);
  }
  if (!user.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    // Track failed login attempt
    const { trackSuspiciousActivity } = await import('../services/auto-blocker.service');
    await trackSuspiciousActivity(req.ip || '', 'failed_login', { email, reason: 'invalid_password' });
    void recordSmoisAuthEvent(req, user, 'AUTH_LOGIN_FAILED', { reason: 'invalid_password' });
    return apiResponse.error(res, 'Incorrect password. Please try again.', 401);
  }

  if (!user.isEmailVerified) {
    await issueEmailOtpIfAllowed(user.id, user.email, user.name);
    return apiResponse.error(res, 'Your email is not verified. A new code has been sent to your email.', 403, [
      { requiresVerification: true, userId: user.id, email: user.email, role: user.role.toLowerCase() },
    ]);
  }

  // Multi-role accounts reopen the experience they last used.
  const activeRole = await resolveLoginRole(user);
  const accessToken = generateAccessToken({ userId: user.id, role: activeRole });
  const refreshToken = generateRefreshToken({ userId: user.id, role: activeRole });

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(refreshToken) } });

  if (user.role === 'RIDER') await claimFleetInvite({ id: user.id, email: user.email });
  const approvalStatus = await resolveApprovalStatus(user.id, activeRole);
  void recordSmoisAuthEvent(req, user, 'AUTH_LOGIN');

  return apiResponse.success(res, 'Login successful.', {
    user: { ...buildUserPayload(user), role: activeRole, ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  });
});

export const googleAuth = catchAsync(async (req: Request, res: Response) => {
  const { idToken, referralCode } = req.body;

  if (GOOGLE_CLIENT_IDS.length === 0) {
    return apiResponse.error(res, 'Google sign-in is not configured on the server.', 500);
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_IDS });
    payload = ticket.getPayload();
  } catch (err) {
    recordError('auth', 'Google sign-in failed: invalid or expired token', err);
    return apiResponse.error(res, 'Invalid or expired Google token.', 401);
  }

  if (!payload?.email) {
    recordError('auth', 'Google sign-in failed: no email on Google account');
    return apiResponse.error(res, 'Google account has no email address.', 400);
  }

  // Google can link to an existing account by email, so the address must be one Google has verified.
  if (payload.email_verified === false) {
    return apiResponse.error(res, 'Your Google email address is not verified.', 401);
  }

  const email = payload.email.toLowerCase();
  let user = await findUserByEmail(email);

  if (user) {
    if (!user.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);
    if (user.role !== 'CUSTOMER' && user.role !== 'VENDOR') {
      return apiResponse.error(res, 'This email is already registered as a different account type. Sign in with your password instead.', 409);
    }
    if (!user.googleId || !user.isEmailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, isEmailVerified: true },
      });
    }
  } else {
    let referredById: string | undefined;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (referrer) referredById = referrer.id;
    }

    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: payload.name || email.split('@')[0],
          email,
          googleId: payload.sub,
          role: Role.CUSTOMER,
          isEmailVerified: true,
          avatar: payload.picture,
          referralCode: generateReferralCode(),
          referredById,
          ...signupConsent(req.body, 'google'),
        },
      });

      await tx.customer.create({ data: { userId: newUser.id } });
      if (referredById) {
        await tx.referral.create({ data: { referrerId: referredById, refereeId: newUser.id } });
      }

      return newUser;
    });

    void sendWelcomeEmail(user.email, user.name, user.role);
    // Google sign-up lands already email-verified.
    void recordOnboardingEvent(user.id, user.role, 'SIGNED_UP');
    void recordOnboardingEvent(user.id, user.role, 'EMAIL_VERIFIED');
  }

  const activeRole = await resolveLoginRole(user);
  const accessToken = generateAccessToken({ userId: user.id, role: activeRole });
  const refreshToken = generateRefreshToken({ userId: user.id, role: activeRole });
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(refreshToken) } });

  let approvalStatus: string | undefined;
  if (activeRole === 'VENDOR') {
    const vendor = await vendorStanding(user.id);
    approvalStatus = vendor?.approvalStatus;
  } else if (activeRole === 'RIDER') {
    approvalStatus = await resolveApprovalStatus(user.id, activeRole);
  }

  return apiResponse.success(res, 'Signed in with Google.', {
    user: { ...buildUserPayload(user), role: activeRole, ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  });
});

export const appleAuth = catchAsync(async (req: Request, res: Response) => {
  const { identityToken, authorizationCode, fullName, referralCode } = req.body as {
    identityToken: string; authorizationCode?: string; fullName?: string; referralCode?: string;
  };

  let identity;
  try {
    identity = await verifyAppleIdentityToken(identityToken);
  } catch (err) {
    if (!(err instanceof AppleAuthError)) recordError('auth', 'Apple sign-in failed: could not verify token', err);
    return apiResponse.error(res, 'Invalid or expired Apple token.', 401);
  }

  // Apple's id is the stable key. The email is only used to join an existing GoBuyMe account the first time.
  let user = await prisma.user.findUnique({ where: { appleId: identity.sub } });

  if (user) {
    if (!user.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);
  } else {
    if (!identity.email) {
      return apiResponse.error(res, 'Apple did not share an email address. Open Settings > Apple ID > Sign-In & Security > Sign in with Apple, remove GoBuyMe, and try again.', 400);
    }
    const email = identity.email;
    const existing = await findUserByEmail(email);

    if (existing) {
      // Only a verified address may join an existing account, as with Google.
      if (!identity.emailVerified) return apiResponse.error(res, 'Your Apple email address is not verified.', 401);
      if (!existing.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);
      if (existing.role !== 'CUSTOMER' && existing.role !== 'VENDOR') {
        return apiResponse.error(res, 'This email is already registered as a different account type. Sign in with your password instead.', 409);
      }
      user = await prisma.user.update({
        where: { id: existing.id },
        data: { appleId: identity.sub, isEmailVerified: true },
      });
    } else {
      let referredById: string | undefined;
      if (referralCode) {
        const referrer = await prisma.user.findUnique({ where: { referralCode } });
        if (referrer) referredById = referrer.id;
      }
      // A "Hide My Email" address has a meaningless local part, so do not use it as the name.
      const name = fullName?.trim() || (identity.isPrivateRelay ? 'GoBuyMe customer' : email.split('@')[0]);

      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            name,
            email,
            appleId: identity.sub,
            role: Role.CUSTOMER,
            isEmailVerified: true,
            referralCode: generateReferralCode(),
            referredById,
            ...signupConsent(req.body, 'apple'),
          },
        });
        await tx.customer.create({ data: { userId: newUser.id } });
        if (referredById) {
          await tx.referral.create({ data: { referrerId: referredById, refereeId: newUser.id } });
        }
        return newUser;
      });

      // Mail to a relay address only arrives if the sending domain is registered with Apple, so skip it there.
      if (!identity.isPrivateRelay) void sendWelcomeEmail(user.email, user.name, user.role);
      void recordOnboardingEvent(user.id, user.role, 'SIGNED_UP');
      void recordOnboardingEvent(user.id, user.role, 'EMAIL_VERIFIED');
    }
  }

  // Keep a refresh token so the Apple grant can be revoked if the account is deleted. Never blocks sign-in.
  if (authorizationCode) {
    try {
      const refresh = await exchangeAppleAuthorizationCode(authorizationCode);
      if (refresh) {
        await prisma.user.update({ where: { id: user.id }, data: { appleRefreshToken: encryptSecret(refresh) } });
      }
    } catch (err) {
      recordError('auth', 'Apple sign-in: could not store the refresh token', err);
    }
  }

  const activeRole = await resolveLoginRole(user);
  const accessToken = generateAccessToken({ userId: user.id, role: activeRole });
  const refreshToken = generateRefreshToken({ userId: user.id, role: activeRole });
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(refreshToken) } });

  let approvalStatus: string | undefined;
  if (activeRole === 'VENDOR') {
    const vendor = await vendorStanding(user.id);
    approvalStatus = vendor?.approvalStatus;
  } else if (activeRole === 'RIDER') {
    approvalStatus = await resolveApprovalStatus(user.id, activeRole);
  }

  return apiResponse.success(res, 'Signed in with Apple.', {
    user: { ...buildUserPayload(user), role: activeRole, ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  });
});

export const activationStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;

  if (role === 'VENDOR' || role === 'RIDER' || role === 'LOGISTICS_COMPANY') {
    if (role === 'RIDER') {
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (me) await claimFleetInvite({ id: userId, email: me.email });
    }
    const approvalStatus = await resolveApprovalStatus(userId, role as Role);
    return apiResponse.success(res, 'Status fetched.', { approvalStatus: approvalStatus ?? 'PENDING' });
  }

  return apiResponse.success(res, 'Status fetched.', { approvalStatus: 'APPROVED' });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  let decoded: { userId: string; role: string };
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as {
      userId: string; role: string;
    };
  } catch {
    return apiResponse.error(res, 'Invalid refresh token.', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !refreshTokenMatches(user.refreshToken, refreshToken)) {
    return apiResponse.error(res, 'Refresh token revoked.', 401);
  }

  // Keep the role the user switched into, but only while they still qualify for it
  // (a suspended rider drops back to the account's primary role on the next refresh).
  let activeRole: Role = user.role;
  if (decoded.role !== user.role && (await canActAs(user.id, user.role, decoded.role as Role))) {
    activeRole = decoded.role as Role;
  }

  const newAccessToken = generateAccessToken({ userId: user.id, role: activeRole });
  const newRefreshToken = generateRefreshToken({ userId: user.id, role: activeRole });

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(newRefreshToken) } });

  return apiResponse.success(res, 'Token refreshed.', {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

// GET /auth/roles — every experience this account can use, with its standing.
export const getRoles = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { role: true } });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  const roles = await getRoleStatuses(req.user!.userId, user.role);
  return apiResponse.success(res, 'Roles fetched.', { primaryRole: user.role, activeRole: req.user!.role, roles });
});

// POST /auth/add-role — a signed-in customer/vendor/rider registers a second role on the same
// account. Creates the profile (pending approval, same as signup) and switches into it.
export const addRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    role, address, city, state, latitude, longitude,
    commissionTier, businessName, category, vehicleType, plateNumber,
  } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !user.isActive || user.deletedAt) return apiResponse.error(res, 'Account suspended. Contact support.', 403);
  if (!isSwitchableAccount(user.role)) return apiResponse.error(res, 'This account type cannot add roles.', 403);
  if (!user.isEmailVerified) return apiResponse.error(res, 'Verify your email before adding a role.', 403);

  const statuses = await getRoleStatuses(user.id, user.role);
  if (statuses.find((s) => s.role === role)?.status !== 'NOT_REGISTERED') {
    return apiResponse.error(res, 'This account already has that role.', 409);
  }

  if (role === 'VENDOR') {
    const nameTaken = await prisma.vendor.findFirst({
      where: { businessName: { equals: businessName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (nameTaken) return apiResponse.error(res, 'A store with this business name already exists. Please choose a different name.', 409);

    const slug =
      businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + user.id.slice(0, 6);
    await prisma.vendor.create({
      data: {
        userId: user.id, businessName: businessName.trim(), slug,
        category: category as VendorCategory, address, city, state,
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        commissionTier: commissionTier as CommissionTier,
        isPharmacyFlagged: category === 'PHARMACY',
      },
    });
  } else {
    await prisma.rider.create({
      data: {
        userId: user.id, vehicleType, plateNumber, address, city, state,
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
      },
    });
  }

  const target = role as Role;
  const accessToken = generateAccessToken({ userId: user.id, role: target });
  const refreshToken = generateRefreshToken({ userId: user.id, role: target });
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(refreshToken), lastActiveRole: target } });

  // The new role's own funnel starts here; the email was already verified when the account was made.
  void recordOnboardingEvent(user.id, target, 'SIGNED_UP', { addedToExistingAccount: true });
  void recordOnboardingEvent(user.id, target, 'EMAIL_VERIFIED', { addedToExistingAccount: true });

  const approvalStatus = await resolveApprovalStatus(user.id, target);
  return apiResponse.success(res, 'Role added.', {
    user: { ...buildUserPayload(user), role: target, ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  }, 201);
});

// POST /auth/switch-role { role } — same user and session history, new active experience.
// Permissions are enforced server-side from the role claim in the token this issues.
export const switchRole = catchAsync(async (req: AuthRequest, res: Response) => {
  const target = String(req.body?.role ?? '').toUpperCase() as Role;
  if (!SWITCHABLE_ROLES.includes(target)) return apiResponse.error(res, 'Invalid role.', 400);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !user.isActive) return apiResponse.error(res, 'Account suspended. Contact support.', 403);
  if (!isSwitchableAccount(user.role)) {
    return apiResponse.error(res, 'This account type cannot switch roles.', 403);
  }
  if (!(await canActAs(user.id, user.role, target))) {
    return apiResponse.error(res, 'You are not registered or approved for that role.', 403);
  }

  if (target === Role.CUSTOMER) await ensureCustomerProfile(user.id);

  const accessToken = generateAccessToken({ userId: user.id, role: target });
  const refreshToken = generateRefreshToken({ userId: user.id, role: target });
  // Remember the choice so the next sign-in opens this experience.
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: hashRefreshToken(refreshToken), lastActiveRole: target } });

  const approvalStatus = await resolveApprovalStatus(user.id, target);
  return apiResponse.success(res, 'Role switched.', {
    user: { ...buildUserPayload(user), role: target, ...(approvalStatus !== undefined ? { approvalStatus } : {}) },
    accessToken,
    refreshToken,
  });
});

export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.user?.userId) {
    await prisma.user.update({ where: { id: req.user.userId }, data: { refreshToken: null } });
    void recordSmoisAuthEvent(req, { id: req.user.userId, role: req.user.role }, 'AUTH_LOGOUT');
  }
  return apiResponse.success(res, 'Logged out successfully.');
});

// POST /auth/socket-ticket — short-lived credential for the Socket.io handshake.
// The web app keeps its access token in an httpOnly cookie, so browser JS can only
// reach this through the BFF proxy; mobile uses it too so token refresh is handled
// by the normal axios interceptor instead of by the socket layer.
export const socketTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  return apiResponse.success(res, 'Socket ticket issued.', { ticket: generateSocketTicket({ userId, role }) });
});

// POST /auth/kyc-upload-ticket — signed parameters for a private (authenticated) Cloudinary upload of an
// identity or verification image. The folder is the caller's own, so one account cannot overwrite another's.
const KYC_UPLOAD_ROLES = new Set(['VENDOR', 'RIDER', 'LOGISTICS_COMPANY', 'SUPER_ADMIN', 'OPERATIONS_ADMIN']);
export const kycUploadTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.user!;
  if (!KYC_UPLOAD_ROLES.has(role)) return apiResponse.error(res, 'Not allowed.', 403);
  return apiResponse.success(res, 'Upload ticket issued.', createUploadTicket(userId));
});

export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, name: true, email: true, phone: true,
      role: true, avatar: true, avatarPosition: true, isEmailVerified: true,
      isPhoneVerified: true,
      mfaEnabled: true,
      referralCode: true, freeDeliveryCredits: true,
      createdAt: true,
      password: true, appleId: true,
    },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);
  // Never send the hash itself: the app only needs to know how this account confirms a deletion.
  const { password, appleId, ...safe } = user;
  // `role` is the active experience (token claim) so apps that route by it stay on the role the
  // user switched into; `primaryRole` is what the account signed up as.
  return apiResponse.success(res, 'User fetched.', {
    ...safe,
    hasPassword: Boolean(password),
    hasApple: Boolean(appleId),
    role: isSwitchableAccount(user.role) ? req.user!.role : user.role,
    primaryRole: user.role,
  });
});

// POST /auth/phone/send-otp — SMS a 6-digit code to `phone` (or the current number).
export const sendPhoneVerificationCode = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const result = await sendPhoneOtp(req.user!.userId, req.body?.phone);
    return apiResponse.success(res, 'Verification code sent.', result);
  } catch (err) {
    return sendOtpError(res, err);
  }
});

// POST /auth/phone/verify — confirm the code; the number becomes the verified phone.
export const verifyPhoneCode = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const result = await verifyPhoneOtp(req.user!.userId, req.body?.code);
    return apiResponse.success(res, 'Phone number verified.', { ...result, isPhoneVerified: true });
  } catch (err) {
    return sendOtpError(res, err);
  }
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, phone, photoUrl } = req.body as {
    name?: string; phone?: string; photoUrl?: string;
  };

  const data: Record<string, unknown> = {};
  if (name?.trim())    data.name   = name.trim();
  if (phone !== undefined) data.phone  = phone.trim() || null;
  if (photoUrl !== undefined) data.avatar = photoUrl || null;

  const avatarPosition = parseImagePosition(req.body.avatarPosition);
  if (avatarPosition === false) {
    return apiResponse.error(res, 'Image position must look like "50% 30%".', 400);
  }
  if (photoUrl !== undefined || avatarPosition !== undefined) {
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { avatar: true } });
    const next = nextImagePosition(avatarPosition, photoUrl, current?.avatar);
    if (next.set) data.avatarPosition = next.value;
  }

  if (Object.keys(data).length === 0) {
    return apiResponse.error(res, 'No fields to update.', 400);
  }

  // A changed number has not been proven by SMS, so it loses its verified status.
  if (data.phone !== undefined) {
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { phone: true } });
    if (current?.phone !== data.phone) {
      data.isPhoneVerified = false;
      data.phoneVerifiedAt = null;
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data,
    select: { id: true, name: true, email: true, phone: true, role: true, avatar: true, avatarPosition: true, isPhoneVerified: true },
  });

  return apiResponse.success(res, 'Profile updated.', user);
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body.email);
  const user = await findUserByEmail(email);

  if (!user) return apiResponse.success(res, 'If that email exists, a reset link has been sent.');

  const resetToken = generateReferralCode() + Date.now().toString(36);
  const hashedToken = await bcrypt.hash(resetToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  void sendPasswordResetEmail(email, resetToken);
  return apiResponse.success(res, 'If that email exists, a reset link has been sent.');
});

export const changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword, otp } = req.body as { currentPassword: string; newPassword: string; otp: string };

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, password: true },
  });
  if (!user || !user.password) return apiResponse.error(res, 'User not found.', 404);

  let otpId: string;
  try {
    otpId = await checkEmailOtp(user.id, otp);
  } catch (err) {
    return sendOtpError(res, err);
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return apiResponse.error(res, 'Current password is incorrect.', 401);

  if (newPassword === currentPassword) {
    return apiResponse.error(res, 'New password must be different from your current password.', 400);
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    prisma.emailOtp.update({ where: { id: otpId }, data: { used: true } }),
  ]);

  void recordSmoisAuthEvent(req, { id: user.id, role: req.user!.role }, 'AUTH_PASSWORD_CHANGED');
  return apiResponse.success(res, 'Password changed successfully.');
});

const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

export const deleteAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { password, appleIdentityToken } = req.body as { password?: string; appleIdentityToken?: string };
  const { userId, role } = req.user!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phone: true, password: true, appleId: true, appleRefreshToken: true },
  });
  if (!user) return apiResponse.error(res, 'User not found.', 404);

  if (user.password && password) {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return apiResponse.error(res, 'Incorrect password.', 401);
  } else if (user.appleId && appleIdentityToken) {
    // No password on this account: a fresh Apple sign-in for the same Apple id is the confirmation.
    try {
      const identity = await verifyAppleIdentityToken(appleIdentityToken);
      if (identity.sub !== user.appleId) return apiResponse.error(res, 'That Apple account does not match this account.', 401);
    } catch {
      return apiResponse.error(res, 'Could not confirm with Apple. Please try again.', 401);
    }
  } else {
    return apiResponse.error(
      res,
      user.appleId ? 'Sign in with Apple again to confirm deleting your account.'
        : user.password ? 'Enter your password to delete your account.'
        : 'This account has no password. Contact support to delete it.',
      400,
    );
  }

  if (role === 'VENDOR') {
    const managed = await prisma.vendor.findFirst({ where: { managerUserId: userId }, select: { id: true } });
    if (managed) {
      return apiResponse.error(res, 'Branch manager logins are managed by the business owner. Ask them to remove your access.', 403);
    }
  }

  let domainId: string | undefined;
  let orderWhere: Record<string, unknown> | undefined;
  let ownedVendors: { id: string; businessName: string; parentVendorId?: string | null }[] = [];
  let entity: 'Customer' | 'Vendor' | 'Rider' | 'LogisticsCompany' | undefined;
  let companyName: string | undefined;
  let businessName: string | undefined;

  if (role === 'CUSTOMER') {
    const customer = await prisma.customer.findUnique({ where: { userId }, select: { id: true } });
    if (customer) { domainId = customer.id; orderWhere = { customerId: customer.id }; entity = 'Customer'; }
  } else if (role === 'VENDOR') {
    // The main business and every branch belong to this account and go together.
    ownedVendors = await prisma.vendor.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, businessName: true, parentVendorId: true },
    });
    const main = ownedVendors.find((v) => !v.parentVendorId) ?? ownedVendors[0];
    if (main) {
      domainId = main.id;
      orderWhere = { vendorId: { in: ownedVendors.map((v) => v.id) } };
      entity = 'Vendor';
      businessName = main.businessName;
    }
  } else if (role === 'RIDER') {
    const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });
    if (rider) { domainId = rider.id; orderWhere = { riderId: rider.id }; entity = 'Rider'; }
  } else if (role === 'LOGISTICS_COMPANY') {
    const company = await prisma.logisticsCompany.findUnique({ where: { userId }, select: { id: true, companyName: true } });
    if (company) { domainId = company.id; entity = 'LogisticsCompany'; companyName = company.companyName; }
  }

  if (orderWhere) {
    const activeOrder = await prisma.order.findFirst({
      where: { ...orderWhere, status: { notIn: TERMINAL_ORDER_STATUSES } },
    });
    if (activeOrder) {
      return apiResponse.error(res, 'This account has an order in progress and cannot be deleted yet.', 409);
    }
  }

  // Apple requires the Sign in with Apple grant to be revoked when the account is deleted.
  // Best effort: a failure is logged and must not stop the person deleting their account.
  if (user.appleRefreshToken) {
    try {
      await revokeAppleRefreshToken(decryptSecret(user.appleRefreshToken));
    } catch (err) {
      recordError('auth', 'Account deletion: could not revoke the Apple grant', err);
    }
  }

  let erased: ErasureResult = { imageUrls: [] };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        email: `deleted-${user.id}@deleted.gobuyme.local`,
        googleId: null,
        appleId: null,
        appleRefreshToken: null,
        phone: null,
        refreshToken: null,
        pushToken: null,
        analyticsOptIn: false,
      },
    });
    // Usage analytics are not needed for any legal/financial record — erase them outright.
    await tx.appEvent.deleteMany({ where: { userId: user.id } });
    // Name, avatar, addresses, carts, notifications, chat text and every identity document (all roles).
    erased = await eraseAccountData(tx, user.id);

    // Vendor/rider public-facing queries filter on approvalStatus === APPROVED,
    // so suspending here removes them from customer-facing discovery without
    // touching every one of those query sites individually.
    if (role === 'VENDOR' && domainId) {
      for (const v of ownedVendors) {
        // A branch's manager login is the owner's to give, so it closes with the owner's account.
        if (v.parentVendorId) await revokeManagerLogin(tx, user.id, v.id);
        await tx.vendor.update({
          where: { id: v.id },
          data: { approvalStatus: 'SUSPENDED', isOpen: false, businessName: deletedVendorName(v.businessName, v.id) },
        });
      }
    } else if (role === 'RIDER' && domainId) {
      await tx.rider.update({ where: { id: domainId }, data: { approvalStatus: 'SUSPENDED' } });
    } else if (role === 'LOGISTICS_COMPANY' && domainId) {
      // Suspending the company also takes its fleet off the road (see fleet.service).
      await tx.logisticsCompany.update({
        where: { id: domainId },
        data: { approvalStatus: 'SUSPENDED', companyName: deletedVendorName(companyName!, domainId) },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: `${role}_SELF_DELETED`,
        entity: entity ?? 'User',
        entityId: domainId ?? user.id,
        // The audit log cannot be edited later, so it never holds the email or phone itself: a hash lets us
        // recognise the account if the person contacts support, and nothing more.
        meta: { emailHash: hashForAudit(user.email), phoneLast4: lastFour(user.phone), ...(businessName ? { businessName } : {}) },
      },
    });
  });

  // After the database change has committed: remove the stored photos (best effort).
  void deleteStoredImages(erased.imageUrls);

  return apiResponse.success(res, 'Account deleted.');
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  const users = await prisma.user.findMany({
    where: {
      passwordResetToken: { not: null },
      passwordResetExpiresAt: { gt: new Date() },
    },
    select: { id: true, passwordResetToken: true },
  });

  let targetUser: { id: string } | null = null;

  for (const u of users) {
    if (!u.passwordResetToken) continue;
    const match = await bcrypt.compare(token, u.passwordResetToken);
    if (match) { targetUser = u; break; }
  }

  if (!targetUser) return apiResponse.error(res, 'Invalid or expired reset token.', 400);

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: targetUser.id },
    data: { password: hashed, passwordResetToken: null, passwordResetExpiresAt: null },
  });

  return apiResponse.success(res, 'Password reset successfully.');
});

