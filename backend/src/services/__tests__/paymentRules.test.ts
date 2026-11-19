import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { amountCoversOrder, expectedCharge, orderIdFromMetadata } from '../paymentRules';
import { isHiddenFromVendor } from '../vendorOrderVisibility';

describe('expectedCharge', () => {
  it('is the total minus applied store credit', () => {
    expect(expectedCharge({ totalAmount: 5000, creditApplied: 1200 })).toBe(3800);
  });
  it('never goes negative', () => {
    expect(expectedCharge({ totalAmount: 1000, creditApplied: 1500 })).toBe(0);
  });
});

describe('amountCoversOrder', () => {
  const order = { totalAmount: 5000, creditApplied: 500 };
  it('accepts the exact amount', () => expect(amountCoversOrder(4500, order)).toBe(true));
  it('accepts an overpayment', () => expect(amountCoversOrder(6000, order)).toBe(true));
  it('absorbs sub-kobo rounding', () => expect(amountCoversOrder(4499.995, order)).toBe(true));
  it('rejects an underpayment (cheap reference replayed on a dearer order)', () => {
    expect(amountCoversOrder(100, order)).toBe(false);
    expect(amountCoversOrder(4499, order)).toBe(false);
  });
  it('rejects when Paystack reported no amount', () => {
    expect(amountCoversOrder(null, order)).toBe(false);
    expect(amountCoversOrder(NaN, order)).toBe(false);
  });
});

describe('orderIdFromMetadata', () => {
  it('reads a string orderId', () => expect(orderIdFromMetadata({ orderId: 'abc-123' })).toBe('abc-123'));
  it('ignores missing, empty, non-string and oversized ids', () => {
    expect(orderIdFromMetadata(undefined)).toBeNull();
    expect(orderIdFromMetadata(null)).toBeNull();
    expect(orderIdFromMetadata('orderId')).toBeNull();
    expect(orderIdFromMetadata({})).toBeNull();
    expect(orderIdFromMetadata({ orderId: '' })).toBeNull();
    expect(orderIdFromMetadata({ orderId: 42 })).toBeNull();
    expect(orderIdFromMetadata({ orderId: { $ne: null } })).toBeNull();
    expect(orderIdFromMetadata({ orderId: 'x'.repeat(65) })).toBeNull();
  });
});

describe('isHiddenFromVendor', () => {
  const base = { paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PENDING, vendorNotifiedAt: null };
  it('hides an unpaid card order', () => expect(isHiddenFromVendor(base)).toBe(true));
  it('hides an unpaid transfer order and a failed payment', () => {
    expect(isHiddenFromVendor({ ...base, paymentMethod: PaymentMethod.BANK_TRANSFER })).toBe(true);
    expect(isHiddenFromVendor({ ...base, paymentStatus: PaymentStatus.FAILED, vendorNotifiedAt: new Date() })).toBe(true);
  });
  it('shows a paid card order once the vendor has been alerted', () => {
    expect(isHiddenFromVendor({ ...base, paymentStatus: PaymentStatus.PAID, vendorNotifiedAt: new Date() })).toBe(false);
  });
  it('keeps a refunded order the vendor saw (rejected or customer-cancelled after paying)', () => {
    expect(isHiddenFromVendor({ ...base, paymentStatus: PaymentStatus.REFUNDED, vendorNotifiedAt: new Date() })).toBe(false);
  });
  it('hides a late-paid, store-credited order the vendor never saw', () => {
    expect(isHiddenFromVendor({ ...base, paymentStatus: PaymentStatus.REFUNDED })).toBe(true);
  });
  it('never hides cash on delivery, whose payment stays PENDING by design', () => {
    expect(isHiddenFromVendor({ ...base, paymentMethod: PaymentMethod.CASH_ON_DELIVERY, vendorNotifiedAt: new Date() })).toBe(false);
  });
});
