'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REQUESTER' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketCategory =
  | 'ORDER_ISSUE' | 'MISSING_ITEM' | 'LATE_DELIVERY' | 'PAYMENT' | 'REFUND'
  | 'ACCOUNT' | 'RIDER_CONDUCT' | 'VENDOR_ISSUE' | 'APP_BUG' | 'OTHER';

export const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER', 'RESOLVED', 'CLOSED'];
export const TICKET_PRIORITIES: TicketPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
export const TICKET_CATEGORIES: TicketCategory[] = [
  'ORDER_ISSUE', 'MISSING_ITEM', 'LATE_DELIVERY', 'PAYMENT', 'REFUND',
  'ACCOUNT', 'RIDER_CONDUCT', 'VENDOR_ISSUE', 'APP_BUG', 'OTHER',
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  PENDING_REQUESTER: 'Waiting on user',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };

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

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { theme: T } = useTheme();
  const cfg = {
    OPEN: { color: T.info, bg: T.infoBg },
    IN_PROGRESS: { color: T.primary, bg: T.primaryTint },
    PENDING_REQUESTER: { color: T.warning, bg: T.warningBg },
    RESOLVED: { color: T.success, bg: T.successBg },
    CLOSED: { color: T.textSec, bg: T.surface3 },
  }[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const { theme: T } = useTheme();
  const color = { URGENT: T.error, HIGH: T.warning, NORMAL: T.info, LOW: T.textSec }[priority];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 9999, background: color }} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Re-renders every 30s so SLA countdowns stay current without refetching. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const fmtDuration = (ms: number) => {
  const mins = Math.round(Math.abs(ms) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
};

/** SLA chip: time left (amber under 1h) or how long overdue (red). Hidden when the clock isn't running. */
export function SlaChip({ status, slaDueAt, firstResponseAt, now }: {
  status: TicketStatus; slaDueAt: string; firstResponseAt: string | null; now: number;
}) {
  const { theme: T } = useTheme();
  if (status !== 'OPEN' && status !== 'IN_PROGRESS') return null;
  const left = new Date(slaDueAt).getTime() - now;
  const kind = firstResponseAt ? 'Resolve' : 'Reply';
  const overdue = left < 0;
  const color = overdue ? T.error : left < 3_600_000 ? T.warning : T.textSec;
  const bg = overdue ? T.errorBg : left < 3_600_000 ? T.warningBg : T.surface2;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {overdue ? `${kind} overdue ${fmtDuration(left)}` : `${kind} in ${fmtDuration(left)}`}
    </span>
  );
}
