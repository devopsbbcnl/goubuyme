/**
 * What "delete my account" removes (NDPA register G7).
 *
 * Kept on purpose, because the law or a dispute needs it: orders, payments, earnings and payouts (with the
 * customer reduced to an anonymous record), the bank account used for payouts, and the append-only audit log
 * (which holds only a hash of the old email, never the address or phone).
 *
 * Removed: name, avatar, saved addresses, favourites, carts, notifications, push registrations, chat text, and every
 * identity document (numbers and photos), for every role the account holds, not just the one in use.
 */
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';

export interface ErasureResult {
  /** Stored image URLs to delete from Cloudinary once the database change has committed. */
  imageUrls: string[];
}

export const hashForAudit = (value: string | null | undefined): string | null =>
  value ? crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex') : null;

export const lastFour = (value: string | null | undefined): string | null =>
  value ? value.replace(/\D/g, '').slice(-4) || null : null;

export async function eraseAccountData(tx: Prisma.TransactionClient, userId: string): Promise<ErasureResult> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { avatar: true } });
  const imageUrls: string[] = [];
  if (user?.avatar) imageUrls.push(user.avatar);

  // Identity documents: every role the account holds.
  const rider = await tx.rider.findUnique({ where: { userId }, select: { id: true } });
  if (rider) {
    const doc = await tx.riderDocument.findUnique({ where: { riderId: rider.id } });
    if (doc) {
      for (const u of [doc.ninImageUrl, doc.selfieUrl, doc.vehicleImageUrl]) if (u) imageUrls.push(u);
      await tx.riderDocument.delete({ where: { id: doc.id } });
    }
  }
  const vendors = await tx.vendor.findMany({ where: { userId }, select: { id: true } });
  for (const v of vendors) {
    const doc = await tx.vendorDocument.findUnique({ where: { vendorId: v.id } });
    if (doc) {
      for (const u of [doc.imageUrl, doc.imageUrlBack, doc.selfieUrl]) if (u) imageUrls.push(u);
      await tx.vendorDocument.delete({ where: { id: doc.id } });
    }
  }

  // Customer-side personal data (the Customer row stays so past orders keep a valid, anonymous owner).
  const customer = await tx.customer.findUnique({ where: { userId }, select: { id: true } });
  if (customer) {
    await tx.address.deleteMany({ where: { customerId: customer.id } });
    await tx.favorite.deleteMany({ where: { customerId: customer.id } });
    await tx.cart.deleteMany({ where: { customerId: customer.id } });
  }

  await tx.notification.deleteMany({ where: { userId } });
  await tx.pushSubscription.deleteMany({ where: { userId } });
  // The other person in a delivery chat keeps their own side; this person's words are removed.
  await tx.message.updateMany({ where: { senderId: userId }, data: { content: '[deleted]' } });

  await tx.user.update({
    where: { id: userId },
    data: { name: 'Deleted user', avatar: null, avatarPosition: null, isPhoneVerified: false },
  });

  return { imageUrls };
}
