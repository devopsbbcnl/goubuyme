import { OrderEventType, OrderStatus, PaymentStatus } from '@prisma/client';
import { describeOrderEvent, firstName, formatTelegramOrderAlert, AlertOrderInput } from '../orderAlertRules';

const order: AlertOrderInput = {
  orderNumber: 'GBM123',
  totalAmount: 7500,
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentStatus: PaymentStatus.PENDING,
  cancelReason: null,
  vendorName: 'Mama Put',
  customerFirstName: 'Ada',
  riderName: null,
};
const status = (from: OrderStatus | null, to: OrderStatus, extra: Partial<{ note: string | null }> = {}) => ({
  type: OrderEventType.STATUS_CHANGED, fromStatus: from, toStatus: to, note: null, meta: null, ...extra,
});

describe('describeOrderEvent', () => {
  it('announces a cash order created already confirmed as a new order', () => {
    const c = describeOrderEvent(status(null, OrderStatus.CONFIRMED), order);
    expect(c?.kind).toBe('NEW_ORDER');
    expect(c?.summary).toContain('Ada');
    expect(c?.summary).toContain('₦7,500');
    expect(c?.summary).toContain('Cash on delivery');
  });

  it('announces an online order only once payment confirms it, not when created PENDING', () => {
    expect(describeOrderEvent(status(null, OrderStatus.PENDING), order)).toBeNull();
    expect(describeOrderEvent(status(OrderStatus.PENDING, OrderStatus.CONFIRMED), order)?.kind).toBe('NEW_ORDER');
  });

  it('does not call a later move into CONFIRMED a new order', () => {
    expect(describeOrderEvent(status(OrderStatus.PREPARING, OrderStatus.CONFIRMED), order)).toBeNull();
  });

  it('covers the delivery journey', () => {
    const kinds = [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED]
      .map((to) => describeOrderEvent(status(OrderStatus.CONFIRMED, to), order)?.kind);
    expect(kinds).toEqual(['ACCEPTED', 'READY', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']);
  });

  it('flags a real cancellation as urgent and includes the reason', () => {
    const c = describeOrderEvent(status(OrderStatus.CONFIRMED, OrderStatus.CANCELLED, { note: 'Vendor closed' }), order);
    expect(c?.kind).toBe('CANCELLED');
    expect(c?.urgent).toBe(true);
    expect(c?.summary).toContain('Vendor closed');
  });

  it('stays quiet about an abandoned unpaid checkout being swept', () => {
    expect(describeOrderEvent(status(OrderStatus.PENDING, OrderStatus.CANCELLED), order)).toBeNull();
  });

  it('still flags cancelling a paid order that had not been accepted', () => {
    const paid = { ...order, paymentStatus: PaymentStatus.PAID };
    expect(describeOrderEvent(status(OrderStatus.PENDING, OrderStatus.CANCELLED), paid)?.kind).toBe('CANCELLED');
  });

  it('names the rider on assignment and flags removal as urgent', () => {
    const assigned = describeOrderEvent(
      { type: OrderEventType.RIDER_ASSIGNED, fromStatus: null, toStatus: null, note: null, meta: { riderName: 'Tunde' } }, order);
    expect(assigned?.summary).toContain('Tunde');
    const removed = describeOrderEvent(
      { type: OrderEventType.RIDER_UNASSIGNED, fromStatus: null, toStatus: null, note: null, meta: null }, order);
    expect(removed?.urgent).toBe(true);
  });
});

describe('formatTelegramOrderAlert', () => {
  it('escapes HTML in names and links to the console without personal contact details', () => {
    const o = { ...order, vendorName: 'Fish <&> Chips' };
    const c = describeOrderEvent(status(null, OrderStatus.CONFIRMED), o)!;
    const text = formatTelegramOrderAlert(c, o, 'https://admin.example.com/orders');
    expect(text).toContain('Fish &lt;&amp;&gt; Chips');
    expect(text).not.toContain('<&>');
    expect(text).toContain('https://admin.example.com/orders');
    expect(text).not.toMatch(/phone|address/i);
  });
});

describe('firstName', () => {
  it('takes the first word and falls back safely', () => {
    expect(firstName('Ada Obi')).toBe('Ada');
    expect(firstName('')).toBe('Customer');
    expect(firstName(null)).toBe('Customer');
  });
});
