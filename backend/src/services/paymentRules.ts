// Pure rules for deciding whether a Paystack charge really pays for an order. No database here
// so they can be unit-tested; paymentSettlement.service.ts applies them.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Naira Paystack must collect: the order total minus any store credit already applied. */
export function expectedCharge(order: { totalAmount: number; creditApplied: number }): number {
  return Math.max(0, round2(order.totalAmount - order.creditApplied));
}

/**
 * True when the naira actually charged covers the order. `paid` is null when Paystack didn't
 * report an amount — we can't prove it covers the order, so that never counts. A one-kobo
 * tolerance absorbs floating-point rounding; overpaying is fine (the surplus is not refunded
 * here, support handles it), underpaying is not.
 */
export function amountCoversOrder(
  paid: number | null,
  order: { totalAmount: number; creditApplied: number },
): boolean {
  if (paid === null || !Number.isFinite(paid)) return false;
  return round2(paid) >= expectedCharge(order) - 0.01;
}

/**
 * The order id the app put in the Paystack transaction metadata, if any. The mobile popup starts
 * its own transaction (no /payments/initialize), so this is the only link from a webhook back to
 * the order when the app never got to call /payments/verify. Metadata is client-supplied, so the
 * caller must still check the amount and that the reference isn't already attached elsewhere.
 */
export function orderIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const id = (metadata as Record<string, unknown>).orderId;
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : null;
}
