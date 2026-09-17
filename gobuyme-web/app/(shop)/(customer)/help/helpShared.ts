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

export const CUSTOMER_CATEGORIES: TicketCategory[] = [
  'ORDER_ISSUE', 'MISSING_ITEM', 'LATE_DELIVERY', 'REFUND', 'PAYMENT',
  'RIDER_CONDUCT', 'VENDOR_ISSUE', 'ACCOUNT', 'APP_BUG', 'OTHER',
];

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  ORDER_ISSUE: 'Problem with an order',
  MISSING_ITEM: 'Missing or wrong item',
  LATE_DELIVERY: 'Late delivery',
  PAYMENT: 'Payment',
  REFUND: 'Refund',
  ACCOUNT: 'My account',
  RIDER_CONDUCT: 'Rider behaviour',
  VENDOR_ISSUE: 'Vendor problem',
  APP_BUG: 'Website not working',
  OTHER: 'Something else',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Received',
  IN_PROGRESS: 'In progress',
  PENDING_REQUESTER: 'Awaiting your reply',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const STATUS_BADGE: Record<TicketStatus, string> = {
  OPEN: 'badge-info',
  IN_PROGRESS: 'badge-info',
  PENDING_REQUESTER: 'badge-warning',
  RESOLVED: 'badge-success',
  CLOSED: 'badge-neutral',
};

export const FAQS = [
  { q: 'Where is my order?', a: 'Open My Orders and select the active order to see its live status and your rider\'s details.' },
  { q: 'Can I cancel my order?', a: 'You can cancel for a short time after ordering, until the vendor accepts it. Use Cancel Order on the order page.' },
  { q: 'Something was missing or wrong', a: 'Open the order and choose "Get help with this order". Tell us what happened and we\'ll make it right, usually with store credit.' },
  { q: 'How do refunds and store credit work?', a: 'Approved refunds are added as GoBuyMe store credit, which is applied automatically on your next order.' },
];

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

export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.') => {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? fallback;
};
