/**
 * Data retention sweep (NDPA register G9, schedule in section 11 of the register).
 * Every window can be changed with an environment variable; the defaults below are what the privacy policy
 * should say. A window below its floor is ignored so a typo cannot wipe recent data.
 *
 * Not swept here, on purpose: orders/payments/payouts (financial records), the audit log (append-only),
 * leads and prospects (their own jobs), analytics events (their own job).
 */
import prisma from '../config/db';
import { deleteStoredImages } from './kycStorage.service';

const DAY = 24 * 60 * 60 * 1000;

export interface RetentionWindows {
  errorLogDays: number;
  chatDays: number;
  notificationDays: number;
  rejectedKycDays: number;
  /** 0 = keep (off). When on, delivery addresses on old orders are blanked. */
  orderAddressDays: number;
}

const read = (name: string, fallback: number, floor: number, env: NodeJS.ProcessEnv): number => {
  const n = parseInt(env[name] ?? '', 10);
  return Number.isNaN(n) || n < floor ? fallback : n;
};

export function retentionWindows(env: NodeJS.ProcessEnv = process.env): RetentionWindows {
  const addr = parseInt(env.ORDER_ADDRESS_RETENTION_DAYS ?? '', 10);
  return {
    errorLogDays: read('ERROR_LOG_RETENTION_DAYS', 90, 14, env),
    chatDays: read('CHAT_RETENTION_DAYS', 90, 14, env),
    notificationDays: read('NOTIFICATION_RETENTION_DAYS', 180, 30, env),
    rejectedKycDays: read('REJECTED_KYC_RETENTION_DAYS', 30, 7, env),
    orderAddressDays: Number.isNaN(addr) || addr < 180 ? 0 : addr,
  };
}

export const cutoff = (now: Date, days: number): Date => new Date(now.getTime() - days * DAY);

export interface RetentionResult {
  errorLogs: number;
  chatMessages: number;
  notifications: number;
  rejectedKycDocuments: number;
  orderAddresses: number;
}

export async function runRetentionSweep(now = new Date(), windows = retentionWindows()): Promise<RetentionResult> {
  const errorLogs = (await prisma.errorLog.deleteMany({ where: { createdAt: { lt: cutoff(now, windows.errorLogDays) } } })).count;
  const chatMessages = (await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff(now, windows.chatDays) } } })).count;
  const notifications = (await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff(now, windows.notificationDays) } } })).count;

  // Identity documents that were rejected and never fixed: delete the record and the photos.
  const kycCutoff = cutoff(now, windows.rejectedKycDays);
  const urls: string[] = [];
  const riderDocs = await prisma.riderDocument.findMany({ where: { status: 'REJECTED', updatedAt: { lt: kycCutoff } } });
  for (const d of riderDocs) for (const u of [d.ninImageUrl, d.selfieUrl, d.vehicleImageUrl]) if (u) urls.push(u);
  const vendorDocs = await prisma.vendorDocument.findMany({ where: { status: 'REJECTED', updatedAt: { lt: kycCutoff } } });
  for (const d of vendorDocs) for (const u of [d.imageUrl, d.imageUrlBack, d.selfieUrl]) if (u) urls.push(u);
  if (riderDocs.length) await prisma.riderDocument.deleteMany({ where: { id: { in: riderDocs.map((d) => d.id) } } });
  if (vendorDocs.length) await prisma.vendorDocument.deleteMany({ where: { id: { in: vendorDocs.map((d) => d.id) } } });
  if (urls.length) await deleteStoredImages(urls);

  let orderAddresses = 0;
  if (windows.orderAddressDays > 0) {
    orderAddresses = (await prisma.order.updateMany({
      where: { createdAt: { lt: cutoff(now, windows.orderAddressDays) }, status: { in: ['DELIVERED', 'CANCELLED'] }, NOT: { deliveryAddress: '[removed]' } },
      data: { deliveryAddress: '[removed]', deliveryLatitude: null, deliveryLongitude: null },
    })).count;
  }

  return { errorLogs, chatMessages, notifications, rejectedKycDocuments: riderDocs.length + vendorDocs.length, orderAddresses };
}
