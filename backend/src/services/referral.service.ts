import prisma from '../config/db';
import logger from '../utils/logger';
import { notifyUser } from './notification.service';

// Two-sided reward: when the referred user's first order is paid, both the referrer and the
// referee earn a free-delivery credit.
const REFERRER_REWARD_CREDITS = 1;
const REFEREE_REWARD_CREDITS = 1;

export const activateReferral = async (refereeId: string): Promise<void> => {
  try {
    const referral = await prisma.referral.findUnique({ where: { refereeId } });
    // Idempotent: only the referee's first paid order activates the referral and pays out.
    if (!referral || referral.isActive) return;

    await prisma.$transaction([
      prisma.referral.update({
        where: { refereeId },
        data: { isActive: true, activatedAt: new Date(), creditAwarded: true },
      }),
      prisma.user.update({
        where: { id: referral.referrerId },
        data: { freeDeliveryCredits: { increment: REFERRER_REWARD_CREDITS } },
      }),
      prisma.user.update({
        where: { id: refereeId },
        data: { freeDeliveryCredits: { increment: REFEREE_REWARD_CREDITS } },
      }),
    ]);

    logger.info(`Referral activated: referrer ${referral.referrerId} and referee ${refereeId} each earned a free-delivery credit`);

    notifyUser(referral.referrerId, {
      title: 'You earned a free delivery! 🎉',
      body: 'Someone you referred just placed their first order. A free-delivery credit is now on your account.',
      type: 'referral',
    }).catch(() => {});
    notifyUser(refereeId, {
      title: 'Free delivery unlocked! 🎉',
      body: 'Thanks for joining with a referral code — your next order ships free.',
      type: 'referral',
    }).catch(() => {});
  } catch (err) {
    logger.error('activateReferral failed', err);
  }
};

export const applyFreeDelivery = async (
  customerId: string,
  deliveryFee: number,
): Promise<{ fee: number; creditUsed: boolean }> => {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { user: { select: { freeDeliveryCredits: true, id: true } } },
  });

  if (!customer || customer.user.freeDeliveryCredits < 1) {
    return { fee: deliveryFee, creditUsed: false };
  }

  await prisma.user.update({
    where: { id: customer.user.id },
    data: { freeDeliveryCredits: { decrement: 1 } },
  });

  return { fee: 0, creditUsed: true };
};
