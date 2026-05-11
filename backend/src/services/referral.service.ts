import prisma from '../config/db';
import logger from '../utils/logger';

const REFERRALS_PER_CREDIT = 10;

export const activateReferral = async (refereeId: string): Promise<void> => {
  try {
    const referral = await prisma.referral.findUnique({ where: { refereeId } });
    if (!referral || referral.isActive) return;

    await prisma.referral.update({
      where: { refereeId },
      data: { isActive: true, activatedAt: new Date() },
    });

    const activeCount = await prisma.referral.count({
      where: { referrerId: referral.referrerId, isActive: true, creditAwarded: false },
    });

    if (activeCount > 0 && activeCount % REFERRALS_PER_CREDIT === 0) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: referral.referrerId },
          data: { freeDeliveryCredits: { increment: 1 } },
        }),
        prisma.referral.updateMany({
          where: { referrerId: referral.referrerId, isActive: true, creditAwarded: false },
          data: { creditAwarded: true },
        }),
      ]);
      logger.info(`Free delivery credit awarded to user ${referral.referrerId}`);
    }
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
