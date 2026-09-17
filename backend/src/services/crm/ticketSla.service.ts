// Pure helpdesk rules — priority defaults, SLA deadlines and status transitions.
// Kept free of DB access so the rules are unit-testable and shared by API + cron job.

export type TicketCategory =
  | 'ORDER_ISSUE' | 'MISSING_ITEM' | 'LATE_DELIVERY' | 'PAYMENT' | 'REFUND'
  | 'ACCOUNT' | 'RIDER_CONDUCT' | 'VENDOR_ISSUE' | 'APP_BUG' | 'OTHER';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REQUESTER' | 'RESOLVED' | 'CLOSED';

export const TICKET_CATEGORIES: TicketCategory[] = [
  'ORDER_ISSUE', 'MISSING_ITEM', 'LATE_DELIVERY', 'PAYMENT', 'REFUND',
  'ACCOUNT', 'RIDER_CONDUCT', 'VENDOR_ISSUE', 'APP_BUG', 'OTHER',
];
export const TICKET_PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
export const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER', 'RESOLVED', 'CLOSED'];

const HOUR_MS = 60 * 60 * 1000;

/** Hours to first staff response, and to resolution, counted from ticket creation. */
export const SLA_HOURS: Record<TicketPriority, { firstResponse: number; resolution: number }> = {
  URGENT: { firstResponse: 1, resolution: 8 },
  HIGH:   { firstResponse: 4, resolution: 24 },
  NORMAL: { firstResponse: 12, resolution: 48 },
  LOW:    { firstResponse: 24, resolution: 72 },
};

/** RESOLVED tickets with no requester reply are closed after this long. */
export const AUTO_CLOSE_HOURS = 72;

const ORDER_IN_FLIGHT = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP', 'IN_TRANSIT'];

/**
 * Default priority for a new ticket. A problem with an order that is still being
 * delivered is the most time-sensitive thing support handles; money problems next.
 */
export const defaultPriority = (category: TicketCategory, orderStatus?: string | null): TicketPriority => {
  const inFlight = !!orderStatus && ORDER_IN_FLIGHT.includes(orderStatus);
  if (inFlight && ['ORDER_ISSUE', 'LATE_DELIVERY', 'MISSING_ITEM', 'RIDER_CONDUCT'].includes(category)) return 'URGENT';
  if (['PAYMENT', 'REFUND', 'MISSING_ITEM', 'RIDER_CONDUCT'].includes(category)) return 'HIGH';
  if (orderStatus && ['ORDER_ISSUE', 'LATE_DELIVERY', 'VENDOR_ISSUE'].includes(category)) return 'HIGH';
  if (category === 'OTHER') return 'LOW';
  return 'NORMAL';
};

/** The deadline that currently applies: first response until staff reply, then resolution. */
export const slaDueAt = (
  priority: TicketPriority,
  createdAt: Date,
  firstResponseAt: Date | null,
): Date => {
  const hours = firstResponseAt ? SLA_HOURS[priority].resolution : SLA_HOURS[priority].firstResponse;
  return new Date(createdAt.getTime() + hours * HOUR_MS);
};

/** SLA clocks only run while the ball is in support's court. */
export const slaClockRunning = (status: TicketStatus): boolean => status === 'OPEN' || status === 'IN_PROGRESS';

export const isSlaBreached = (
  t: { status: TicketStatus; slaDueAt: Date },
  now = new Date(),
): boolean => slaClockRunning(t.status) && t.slaDueAt.getTime() < now.getTime();

/** Status after the requester posts a reply. Closed tickets cannot be replied to. */
export const statusAfterRequesterReply = (current: TicketStatus): TicketStatus | null => {
  if (current === 'CLOSED') return null;
  if (current === 'PENDING_REQUESTER' || current === 'RESOLVED') return 'IN_PROGRESS';
  return current;
};

/** Status after a staff public reply, unless the agent picked one explicitly. */
export const statusAfterStaffReply = (current: TicketStatus, requested?: TicketStatus): TicketStatus => {
  if (requested) return requested;
  if (current === 'CLOSED' || current === 'RESOLVED') return current;
  return 'PENDING_REQUESTER';
};

/** Maps the legacy mobile "Contact support" topic chips onto ticket categories. */
export const categoryFromLegacyTopic = (topic?: string): TicketCategory => {
  const map: Record<string, TicketCategory> = {
    'Order Issue': 'ORDER_ISSUE',
    Delivery: 'LATE_DELIVERY',
    Payment: 'PAYMENT',
    Account: 'ACCOUNT',
    'App Bug': 'APP_BUG',
    General: 'OTHER',
  };
  return (topic && map[topic]) || 'OTHER';
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  ORDER_ISSUE: 'Order issue',
  MISSING_ITEM: 'Missing or wrong item',
  LATE_DELIVERY: 'Late delivery',
  PAYMENT: 'Payment',
  REFUND: 'Refund',
  ACCOUNT: 'Account',
  RIDER_CONDUCT: 'Rider conduct',
  VENDOR_ISSUE: 'Vendor issue',
  APP_BUG: 'App problem',
  OTHER: 'Something else',
};
