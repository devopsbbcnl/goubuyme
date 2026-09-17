// Helpdesk rules: priority defaults, SLA deadlines, status transitions, and the SLA sweep job.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: { ticket: { findMany: jest.fn(), updateMany: jest.fn() } },
}));
jest.mock('../telegram.service', () => ({
  sendTelegramAlert: jest.fn().mockResolvedValue(true),
  escapeTelegramHtml: (s: string) => s,
}));

import prisma from '../../config/db';
import { sendTelegramAlert } from '../telegram.service';
import {
  categoryFromLegacyTopic, defaultPriority, isSlaBreached, slaDueAt, statusAfterRequesterReply, statusAfterStaffReply,
} from '../crm/ticketSla.service';
import { runTicketSlaSweep } from '../../jobs/ticketSlaJob';

const mockPrisma = prisma as unknown as { ticket: { findMany: jest.Mock; updateMany: jest.Mock } };
const T0 = new Date('2026-09-16T10:00:00Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

describe('defaultPriority', () => {
  it('is URGENT for a problem with an order still being delivered', () => {
    expect(defaultPriority('LATE_DELIVERY', 'IN_TRANSIT')).toBe('URGENT');
    expect(defaultPriority('MISSING_ITEM', 'PICKED_UP')).toBe('URGENT');
  });

  it('is HIGH for money problems and finished-order complaints', () => {
    expect(defaultPriority('REFUND')).toBe('HIGH');
    expect(defaultPriority('PAYMENT', 'DELIVERED')).toBe('HIGH');
    expect(defaultPriority('ORDER_ISSUE', 'DELIVERED')).toBe('HIGH');
  });

  it('falls back to NORMAL, and LOW for "something else"', () => {
    expect(defaultPriority('ACCOUNT')).toBe('NORMAL');
    expect(defaultPriority('ORDER_ISSUE')).toBe('NORMAL');
    expect(defaultPriority('OTHER')).toBe('LOW');
  });
});

describe('slaDueAt', () => {
  it('uses the first-response target until staff reply, then the resolution target', () => {
    expect(slaDueAt('URGENT', T0, null)).toEqual(hours(1));
    expect(slaDueAt('URGENT', T0, hours(0.5))).toEqual(hours(8));
    expect(slaDueAt('LOW', T0, null)).toEqual(hours(24));
  });
});

describe('isSlaBreached', () => {
  it('only counts while the ticket is waiting on support', () => {
    expect(isSlaBreached({ status: 'OPEN', slaDueAt: hours(1) }, hours(2))).toBe(true);
    expect(isSlaBreached({ status: 'PENDING_REQUESTER', slaDueAt: hours(1) }, hours(2))).toBe(false);
    expect(isSlaBreached({ status: 'IN_PROGRESS', slaDueAt: hours(3) }, hours(2))).toBe(false);
  });
});

describe('status transitions', () => {
  it('reopens resolved tickets when the requester replies, and blocks closed ones', () => {
    expect(statusAfterRequesterReply('RESOLVED')).toBe('IN_PROGRESS');
    expect(statusAfterRequesterReply('PENDING_REQUESTER')).toBe('IN_PROGRESS');
    expect(statusAfterRequesterReply('OPEN')).toBe('OPEN');
    expect(statusAfterRequesterReply('CLOSED')).toBeNull();
  });

  it('waits on the requester after a staff reply unless the agent chose a status', () => {
    expect(statusAfterStaffReply('OPEN')).toBe('PENDING_REQUESTER');
    expect(statusAfterStaffReply('IN_PROGRESS', 'RESOLVED')).toBe('RESOLVED');
    expect(statusAfterStaffReply('RESOLVED')).toBe('RESOLVED');
  });

  it('maps legacy contact-support topics', () => {
    expect(categoryFromLegacyTopic('Delivery')).toBe('LATE_DELIVERY');
    expect(categoryFromLegacyTopic('Nonsense')).toBe('OTHER');
    expect(categoryFromLegacyTopic()).toBe('OTHER');
  });
});

describe('runTicketSlaSweep', () => {
  beforeEach(() => jest.clearAllMocks());

  it('claims each breach once, alerts only for HIGH/URGENT, and auto-closes stale resolved tickets', async () => {
    mockPrisma.ticket.findMany.mockResolvedValue([
      { id: 'a', number: 1, subject: 'Rider lost', priority: 'URGENT', firstResponseAt: null, assignee: null },
      { id: 'b', number: 2, subject: 'App slow', priority: 'NORMAL', firstResponseAt: null, assignee: null },
      { id: 'c', number: 3, subject: 'Refund', priority: 'HIGH', firstResponseAt: T0, assignee: { name: 'Ada' } },
    ]);
    mockPrisma.ticket.updateMany
      .mockResolvedValueOnce({ count: 1 })  // a claimed
      .mockResolvedValueOnce({ count: 1 })  // b claimed
      .mockResolvedValueOnce({ count: 0 })  // c already claimed by another worker
      .mockResolvedValueOnce({ count: 4 }); // auto-close

    const result = await runTicketSlaSweep(hours(100));

    expect(result).toEqual({ breached: 2, closed: 4 });
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    expect((sendTelegramAlert as jest.Mock).mock.calls[0][0]).toContain('#1');
    expect(mockPrisma.ticket.updateMany).toHaveBeenLastCalledWith({
      where: { status: 'RESOLVED', resolvedAt: { lt: hours(28) } },
      data: { status: 'CLOSED', closedAt: hours(100) },
    });
  });
});
