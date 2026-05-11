import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { activateReferral } from '../services/referral.service';
import { notifyUser } from '../services/notification.service';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import logger from '../utils/logger';

const PAYSTACK_BASE = 'https://api.paystack.co';
const secret = () => process.env.PAYSTACK_SECRET_KEY as string;

export const initializePayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { orderId, email, amount, callback_url, metadata } = req.body;

  let payloadEmail: string;
  let payloadAmount: number;
  let payloadMeta: object;
  let existingOrderId: string | undefined;

  if (orderId) {
    // ── DB-order flow: look up existing order ──────────────────────────────
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: { customer: { include: { user: { select: { email: true } } } } },
    });
    if (!order) return apiResponse.error(res, 'Order not found.', 404);
    if (order.paymentStatus === PaymentStatus.PAID)
      return apiResponse.error(res, 'Order already paid.', 400);

    payloadEmail  = order.customer.user.email;
    payloadAmount = Math.round(order.totalAmount * 100);
    payloadMeta   = { orderId: order.id, orderNumber: order.orderNumber };
    existingOrderId = order.id;
  } else {
    // ── Direct mobile-checkout flow: accept amount + email directly ────────
    if (!amount || !email)
      return apiResponse.error(res, 'amount and email are required for direct checkout.', 400);

    payloadEmail  = email as string;
    payloadAmount = Number(amount);
    payloadMeta   = (metadata as object) ?? {};
  }

  const reference  = `GBM-${existingOrderId ?? 'MOBILE'}-${Date.now()}`;
  const callbackUrl = callback_url ?? `${process.env.CLIENT_URL}/payment/verify`;

  const paystackPayload = {
    email:        payloadEmail,
    amount:       payloadAmount,
    reference,
    callback_url: callbackUrl,
    metadata:     payloadMeta,
  };

  const { data } = await axios.post(
    `${PAYSTACK_BASE}/transaction/initialize`,
    paystackPayload,
    { headers: { Authorization: `Bearer ${secret()}` } },
  );

  // Persist reference on DB order when one exists
  if (existingOrderId) {
    await prisma.order.update({
      where: { id: existingOrderId },
      data:  { paystackRef: reference },
    });
  }

  return apiResponse.success(res, 'Payment initialized.', {
    authorizationUrl: data.data.authorization_url,
    reference,
    accessCode: data.data.access_code,
  });
});

export const verifyPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { reference, orderId } = req.body;

  const { data } = await axios.get(
    `${PAYSTACK_BASE}/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${secret()}` } },
  );

  if (data.data.status !== 'success') {
    return apiResponse.error(res, 'Payment not successful.', 400);
  }

  // Locate the DB order: first by saved reference, then by explicit orderId.
  // The mobile-side flow generates the reference locally and passes orderId
  // directly, so paystackRef is not pre-saved on the order at this point.
  let order = await prisma.order.findFirst({
    where: { paystackRef: reference, paymentStatus: { not: PaymentStatus.PAID } },
  });

  if (!order && orderId) {
    order = await prisma.order.findFirst({
      where: { id: orderId as string, paymentStatus: { not: PaymentStatus.PAID } },
    });
  }

  if (order) {
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        paystackRef:      reference,
        paymentStatus:    PaymentStatus.PAID,
        paystackVerified: true,
        status:           OrderStatus.CONFIRMED,
      },
      include: { customer: { select: { userId: true } } },
    });

    notifyUser(updatedOrder.customer.userId, {
      title: 'Payment Confirmed ✅',
      body:  `Payment for order #${updatedOrder.orderNumber} was successful. Your order is being prepared!`,
      type:  'payment',
      data:  { orderId: updatedOrder.id },
    }).catch(() => {});

    activateReferral(updatedOrder.customer.userId).catch(() => {});

    return apiResponse.success(res, 'Payment verified.', {
      status:  'success',
      orderId: order.id,
    });
  }

  // Paystack confirmed but no matching DB order found
  return apiResponse.success(res, 'Payment verified.', { status: 'success' });
});

export const handleWebhook = async (req: Request, res: Response) => {
  const hash = crypto
    .createHmac('sha512', secret())
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).send('Invalid signature');
  }

  const { event, data } = req.body;
  res.sendStatus(200);

  try {
    if (event === 'charge.success') {
      const order = await prisma.order.findFirst({ where: { paystackRef: data.reference } });
      if (!order || order.paystackVerified) return;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus:    PaymentStatus.PAID,
          paystackVerified: true,
          status:           OrderStatus.CONFIRMED,
        },
      });
    }

    if (event === 'transfer.success') {
      const batch = await prisma.payoutBatch.findFirst({
        where: { paystackBatchRef: data.transfer_code },
        include: {
          riderEarnings: { include: { rider: { select: { userId: true } } } },
          vendorPayouts: { include: { vendor: { select: { userId: true, businessName: true } } } },
        },
      });
      if (batch) {
        await Promise.all([
          prisma.earning.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutStatus: 'COMPLETED' } }),
          prisma.vendorPayout.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutStatus: 'COMPLETED' } }),
          prisma.payoutBatch.update({ where: { id: batch.id }, data: { status: 'COMPLETED', processedAt: new Date() } }),
        ]);

        const riderTotal = batch.riderEarnings.reduce((s, e) => s + e.netAmount, 0);
        for (const userId of [...new Set(batch.riderEarnings.map(e => e.rider.userId))]) {
          notifyUser(userId, {
            title: 'Payout Received! 🎉',
            body: `₦${riderTotal.toLocaleString()} has landed in your bank account.`,
            type: 'payout',
            data: { transferCode: data.transfer_code },
          }).catch(() => {});
        }

        const vendorTotals = new Map<string, { userId: string; total: number }>();
        for (const vp of batch.vendorPayouts) {
          const entry = vendorTotals.get(vp.vendorId);
          if (entry) { entry.total += vp.netAmount; }
          else { vendorTotals.set(vp.vendorId, { userId: vp.vendor.userId, total: vp.netAmount }); }
        }
        for (const [, { userId, total }] of vendorTotals) {
          notifyUser(userId, {
            title: 'Payout Received! 🎉',
            body: `₦${total.toLocaleString()} has landed in your bank account.`,
            type: 'payout',
            data: { transferCode: data.transfer_code },
          }).catch(() => {});
        }
      }
    }

    if (event === 'transfer.failed') {
      const batch = await prisma.payoutBatch.findFirst({
        where: { paystackBatchRef: data.transfer_code },
      });
      if (batch) {
        await Promise.all([
          prisma.earning.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutStatus: 'FAILED' } }),
          prisma.vendorPayout.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutStatus: 'FAILED' } }),
          prisma.payoutBatch.update({ where: { id: batch.id }, data: { status: 'FAILED', failureReason: data.reason ?? 'Transfer failed' } }),
        ]);
      }
    }
  } catch (err) {
    logger.error('Webhook processing error', err);
  }
};

// GET /payments/resolve-account?account_number=&bank_code=
export const resolveAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { account_number, bank_code } = req.query as Record<string, string>;
  if (!account_number || !bank_code) {
    return apiResponse.error(res, 'account_number and bank_code are required.', 400);
  }
  const { resolveAccountNumber } = await import('../services/paystack.service');
  try {
    const { accountName } = await resolveAccountNumber(account_number, bank_code);
    return apiResponse.success(res, 'Account resolved.', { accountName });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429) {
      return apiResponse.error(res, 'Too many verification requests. Please wait a moment and try again.', 429);
    }
    if (status === 422 || status === 400) {
      return apiResponse.error(res, 'Account not found. Check the account number and bank.', 422);
    }
    throw err;
  }
});
