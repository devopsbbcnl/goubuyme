import type { UserRole } from '@/context/AuthContext';

export type TicketCategory =
  | 'ORDER_ISSUE' | 'MISSING_ITEM' | 'LATE_DELIVERY' | 'PAYMENT' | 'REFUND'
  | 'ACCOUNT' | 'RIDER_CONDUCT' | 'VENDOR_ISSUE' | 'APP_BUG' | 'OTHER';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REQUESTER' | 'RESOLVED' | 'CLOSED';

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  requesterUnread: boolean;
  csatScore: number | null;
  lastMessageAt: string;
  createdAt: string;
  order: { id: string; orderNumber: string; status: string } | null;
}

export interface TicketThread extends TicketSummary {
  canReply: boolean;
  canRate: boolean;
  csatComment: string | null;
  messages: Array<{ id: string; body: string; createdAt: string; from: 'you' | 'support' }>;
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  ORDER_ISSUE: 'Problem with an order',
  MISSING_ITEM: 'Missing or wrong item',
  LATE_DELIVERY: 'Late delivery',
  PAYMENT: 'Payment or payout',
  REFUND: 'Refund',
  ACCOUNT: 'My account',
  RIDER_CONDUCT: 'Rider behaviour',
  VENDOR_ISSUE: 'Vendor problem',
  APP_BUG: 'App not working',
  OTHER: 'Something else',
};

/** Categories that make sense for each kind of user, most common first. */
export const CATEGORIES_FOR_ROLE: Record<Exclude<UserRole, null>, TicketCategory[]> = {
  customer: ['ORDER_ISSUE', 'MISSING_ITEM', 'LATE_DELIVERY', 'REFUND', 'PAYMENT', 'RIDER_CONDUCT', 'VENDOR_ISSUE', 'ACCOUNT', 'APP_BUG', 'OTHER'],
  vendor: ['ORDER_ISSUE', 'PAYMENT', 'RIDER_CONDUCT', 'ACCOUNT', 'APP_BUG', 'OTHER'],
  rider: ['ORDER_ISSUE', 'PAYMENT', 'VENDOR_ISSUE', 'ACCOUNT', 'APP_BUG', 'OTHER'],
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Received',
  IN_PROGRESS: 'In progress',
  PENDING_REQUESTER: 'Awaiting your reply',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const FAQ_FOR_ROLE: Record<Exclude<UserRole, null>, Array<{ q: string; a: string }>> = {
  customer: [
    { q: 'Where is my order?', a: 'Open Orders and tap the active order to see live tracking and your rider\'s location. You can also message or call your rider from there.' },
    { q: 'Can I cancel my order?', a: 'You can cancel for a short time after placing an order, until the vendor accepts it. Use the Cancel button on the order.' },
    { q: 'Something was missing or wrong', a: 'Open the order and tap "Get help with this order". Tell us what was missing and we\'ll make it right, usually with store credit.' },
    { q: 'How do refunds and store credit work?', a: 'Approved refunds are added as GoBuyMe store credit, which is used automatically on your next order.' },
  ],
  vendor: [
    { q: 'When are payouts sent?', a: 'Payouts for delivered orders are processed daily at 11:30 AM to your saved bank account.' },
    { q: 'How do I pause orders?', a: 'Use the open/closed toggle on your dashboard, or set temporary closures in Business Hours.' },
    { q: 'A rider hasn\'t picked up an order', a: 'Open a request about that order and we\'ll reassign or chase the rider.' },
  ],
  rider: [
    { q: 'When do I get paid?', a: 'You keep 85% of each delivery fee. Earnings are paid out daily at 11:30 AM.' },
    { q: 'The vendor isn\'t ready', a: 'Message support from the active delivery so we can contact the vendor and note the delay.' },
    { q: 'I had a problem during a delivery', a: 'Open a request about the order with as much detail as you can, and we\'ll follow up quickly.' },
  ],
};

export const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

/** Pulls the backend's `message` out of an axios error for display. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.') => {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? fallback;
};
