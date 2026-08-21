import prisma from '../config/db';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { PayoutStatus } from '@prisma/client';
import { notifyUser } from './notification.service';
import { initiateTransfer } from './paystack.service';

const RIDER_NET_CUT = parseFloat(process.env.RIDER_NET_CUT || '0.85');
const RIDER_PLATFORM_CUT = parseFloat(process.env.RIDER_PLATFORM_CUT || '0.15');

export const calcRiderEarning = (deliveryFee: number) => ({
  grossAmount: deliveryFee,
  platformCut: Math.round(deliveryFee * RIDER_PLATFORM_CUT * 100) / 100,
  netAmount: Math.round(deliveryFee * RIDER_NET_CUT * 100) / 100,
});

export const runPayoutBatch = async (): Promise<void> => {
  logger.info('Payout batch started');

  try {
    // ── Rider payouts (one batch + one Paystack transfer per rider) ────────────
    const pendingEarnings = await prisma.earning.findMany({
      where: { payoutStatus: PayoutStatus.PENDING },
      include: {
        rider: {
          include: {
            payoutAccount: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Group earnings by rider
    const earningsByRider = new Map<string, typeof pendingEarnings>();
    for (const e of pendingEarnings) {
      const group = earningsByRider.get(e.riderId) ?? [];
      group.push(e);
      earningsByRider.set(e.riderId, group);
    }

    for (const [riderId, earnings] of earningsByRider) {
      const { rider } = earnings[0];

      if (!rider.payoutAccount?.paystackRecipientCode) {
        recordError('payout', `Rider ${rider.user.name} has no payout account — skipping`, undefined, { riderId });
        continue;
      }

      const totalNet      = earnings.reduce((s, e) => s + e.netAmount, 0);
      const totalPlatform = earnings.reduce((s, e) => s + e.platformCut, 0);

      const batch = await prisma.payoutBatch.create({
        data: {
          batchDate:            new Date(),
          totalRiderPayout:     totalNet,
          totalPlatformRevenue: totalPlatform,
          status:               PayoutStatus.PROCESSING,
        },
      });

      await prisma.earning.updateMany({
        where: { id: { in: earnings.map(e => e.id) } },
        data:  { payoutStatus: PayoutStatus.PROCESSING, payoutBatchId: batch.id },
      });

      try {
        const { transferCode } = await initiateTransfer(
          rider.payoutAccount.paystackRecipientCode,
          totalNet,
          `GoBuyMe Rider Payout — ${rider.user.name}`,
        );

        await prisma.payoutBatch.update({
          where: { id: batch.id },
          data:  { paystackBatchRef: transferCode },
        });

        logger.info(`Rider ${rider.user.name}: ₦${totalNet} transfer ${transferCode}`);

        notifyUser(rider.user.id, {
          title: 'Payout Processing 💸',
          body:  `Your earnings of ₦${totalNet.toLocaleString()} are being processed and will arrive shortly.`,
          type:  'payout',
          data:  { batchId: batch.id, amount: totalNet },
        }).catch(() => {});
      } catch (err) {
        recordError('payout', `Rider payout transfer failed for ${rider.user.name}`, err, { riderId, batchId: batch.id, amount: totalNet });
        await prisma.payoutBatch.update({
          where: { id: batch.id },
          data:  { status: PayoutStatus.FAILED, failureReason: 'Transfer initiation failed' },
        });
        await prisma.earning.updateMany({
          where: { payoutBatchId: batch.id },
          data:  { payoutStatus: PayoutStatus.FAILED },
        });
      }
    }

    // ── Vendor payouts (one batch + one Paystack transfer per vendor) ──────────
    const pendingVendorPayouts = await prisma.vendorPayout.findMany({
      where: { payoutStatus: PayoutStatus.PENDING },
      include: { vendor: { include: { payoutAccount: true } } },
    });

    // Group by vendor
    const payoutsByVendor = new Map<string, typeof pendingVendorPayouts>();
    for (const vp of pendingVendorPayouts) {
      const group = payoutsByVendor.get(vp.vendorId) ?? [];
      group.push(vp);
      payoutsByVendor.set(vp.vendorId, group);
    }

    for (const [vendorId, payouts] of payoutsByVendor) {
      const { vendor } = payouts[0];

      if (!vendor.payoutAccount?.paystackRecipientCode) {
        recordError('payout', `Vendor ${vendor.businessName} has no payout account — skipping`, undefined, { vendorId });
        continue;
      }

      const totalNet      = payouts.reduce((s, p) => s + p.netAmount, 0);
      const totalPlatform = payouts.reduce((s, p) => s + p.platformFee, 0);

      const batch = await prisma.payoutBatch.create({
        data: {
          batchDate:            new Date(),
          totalVendorPayout:    totalNet,
          totalPlatformRevenue: totalPlatform,
          status:               PayoutStatus.PROCESSING,
        },
      });

      await prisma.vendorPayout.updateMany({
        where: { id: { in: payouts.map(p => p.id) } },
        data:  { payoutStatus: PayoutStatus.PROCESSING, payoutBatchId: batch.id },
      });

      try {
        const { transferCode } = await initiateTransfer(
          vendor.payoutAccount.paystackRecipientCode,
          totalNet,
          `GoBuyMe Vendor Payout — ${vendor.businessName}`,
        );

        await prisma.payoutBatch.update({
          where: { id: batch.id },
          data:  { paystackBatchRef: transferCode },
        });

        logger.info(`Vendor ${vendor.businessName}: ₦${totalNet} transfer ${transferCode}`);

        notifyUser(vendor.userId, {
          title: 'Payout Processing 💸',
          body:  `Your payout of ₦${totalNet.toLocaleString()} is being processed and will arrive shortly.`,
          type:  'payout',
          data:  { batchId: batch.id, amount: totalNet },
        }).catch(() => {});
      } catch (err) {
        recordError('payout', `Vendor payout transfer failed for ${vendor.businessName}`, err, { vendorId, batchId: batch.id, amount: totalNet });
        await prisma.payoutBatch.update({
          where: { id: batch.id },
          data:  { status: PayoutStatus.FAILED, failureReason: 'Transfer initiation failed' },
        });
        await prisma.vendorPayout.updateMany({
          where: { payoutBatchId: batch.id },
          data:  { payoutStatus: PayoutStatus.FAILED },
        });
      }
    }

    if (!pendingEarnings.length && !pendingVendorPayouts.length) {
      logger.info('Payout batch: nothing to process');
    } else {
      logger.info('Payout batch completed');
    }
  } catch (err) {
    recordError('payout', 'Payout batch failed', err);
  }
};
