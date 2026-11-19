import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

// A card/transfer order exists in the database the moment checkout starts, but it only becomes
// the vendor's business once the money is confirmed. Until then the vendor must not see it, be
// alerted about it, or be able to accept it. Cash-on-delivery and fully-store-credit orders are
// settled at creation, so they are never hidden.
//
// An order is hidden while it is an unpaid non-cash order (PENDING / FAILED payment), or a
// non-cash order the vendor was never alerted about (e.g. paid late after being cancelled and
// banked as store credit).

export const unpaidOrderHiddenFromVendor: Prisma.OrderWhereInput = {
  paymentMethod: { not: PaymentMethod.CASH_ON_DELIVERY },
  OR: [
    { paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
    { vendorNotifiedAt: null },
  ],
};

/** Add to a vendor-facing order query: `where: { vendorId, ...vendorVisibleOrders }`. */
export const vendorVisibleOrders: Prisma.OrderWhereInput = {
  NOT: unpaidOrderHiddenFromVendor,
};

/** In-memory twin of `unpaidOrderHiddenFromVendor`, for rows that are already loaded. */
export function isHiddenFromVendor(order: {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  vendorNotifiedAt: Date | null;
}): boolean {
  if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) return false;
  return (
    order.paymentStatus === PaymentStatus.PENDING ||
    order.paymentStatus === PaymentStatus.FAILED ||
    order.vendorNotifiedAt === null
  );
}
