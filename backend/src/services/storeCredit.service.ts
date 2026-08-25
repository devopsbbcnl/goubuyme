import prisma from '../config/db';
import { recordError } from '../utils/recordError';
import { notifyUser } from './notification.service';

// Non-withdrawable, non-transferable store credit — redeemable only against a future
// GoBuyMe order. Mirrors the freeDeliveryCredits increment/decrement pattern in
// referral.service.ts, but tracks cash amounts with a full ledger for auditability.

export const issueCredit = async (
  userId: string,
  amount: number,
  reason: string,
  orderId?: string,
): Promise<void> => {
  if (amount <= 0) return;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { storeCreditBalance: { increment: amount } },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          type: 'CREDIT',
          amount,
          balanceAfter: updated.storeCreditBalance,
          reason,
          orderId,
        },
      });
    });

    notifyUser(userId, {
      title: 'Store credit added 🎉',
      body: `₦${amount.toLocaleString()} in GoBuyMe credit has been added to your account and is ready to use on your next order.`,
      type: 'store_credit',
      data: { amount, orderId },
    }).catch(() => {});
  } catch (err) {
    recordError('storeCredit', 'issueCredit failed', err, { userId, amount, reason, orderId });
  }
};

export const applyCredit = async (
  userId: string,
  requestedAmount: number,
): Promise<{ amountApplied: number; remainingTotal: number }> => {
  if (requestedAmount <= 0) return { amountApplied: 0, remainingTotal: requestedAmount };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storeCreditBalance: true },
  });

  const amountApplied = Math.min(user?.storeCreditBalance ?? 0, requestedAmount);
  if (amountApplied <= 0) return { amountApplied: 0, remainingTotal: requestedAmount };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { storeCreditBalance: { decrement: amountApplied } },
  });

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'DEBIT',
      amount: amountApplied,
      balanceAfter: updated.storeCreditBalance,
      reason: 'CREDIT_APPLIED_AT_CHECKOUT',
    },
  });

  return { amountApplied, remainingTotal: requestedAmount - amountApplied };
};
