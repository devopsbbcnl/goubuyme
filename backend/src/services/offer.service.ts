import prisma from '../config/db';

export type PromoType = 'percent' | 'flat' | 'free_delivery';

export interface PromoEvaluation {
  valid: boolean;
  /** Machine-readable reason when invalid (also used as the customer-facing message). */
  reason?: string;
  offerId?: string;
  code?: string;
  type?: PromoType;
  /** Naira taken off the subtotal (0 for free-delivery promos). */
  subtotalDiscount: number;
  /** True when the promo waives the delivery fee. */
  freeDelivery: boolean;
}

const deriveType = (discount: number, isPercent: boolean): PromoType => {
  if (discount === 0 && !isPercent) return 'free_delivery';
  if (isPercent) return 'percent';
  return 'flat';
};

const invalid = (reason: string): PromoEvaluation => ({
  valid: false,
  reason,
  subtotalDiscount: 0,
  freeDelivery: false,
});

/**
 * Validate a promo code for a customer + cart and compute the discount it would produce.
 * Pure/read-only — the redemption record is written by placeOrder inside the order transaction.
 */
export async function evaluatePromo(params: {
  code: string;
  userId: string;
  vendorId: string;
  subtotal: number;
}): Promise<PromoEvaluation> {
  const code = params.code?.trim().toUpperCase();
  if (!code) return invalid('Enter a promo code.');

  const offer = await prisma.offer.findUnique({ where: { code } });
  if (!offer || !offer.isActive) return invalid('This promo code is not valid.');
  if (offer.expiresAt && offer.expiresAt <= new Date()) return invalid('This promo code has expired.');
  if (offer.vendorId && offer.vendorId !== params.vendorId) {
    return invalid('This promo code does not apply to this vendor.');
  }
  if (params.subtotal < offer.minOrder) {
    return invalid(`Add ₦${(offer.minOrder - params.subtotal).toLocaleString()} more to use this code.`);
  }

  const alreadyUsed = await prisma.offerRedemption.findUnique({
    where: { offerId_userId: { offerId: offer.id, userId: params.userId } },
  });
  if (alreadyUsed) return invalid('You have already used this promo code.');

  const type = deriveType(offer.discount, offer.isPercent);
  let subtotalDiscount = 0;
  let freeDelivery = false;

  if (type === 'free_delivery') {
    freeDelivery = true;
  } else if (type === 'percent') {
    subtotalDiscount = Math.round((params.subtotal * offer.discount) / 100);
  } else {
    subtotalDiscount = Math.min(offer.discount, params.subtotal);
  }

  return {
    valid: true,
    offerId: offer.id,
    code,
    type,
    subtotalDiscount,
    freeDelivery,
  };
}
