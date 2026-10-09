jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../telegram.service', () => ({ sendTelegramAlert: jest.fn(), escapeTelegramHtml: (s: string) => s }));
jest.mock('../notification.service', () => ({ notifyUser: jest.fn() }));

import { OrderStatus } from '@prisma/client';
import { Candidate, planDispatch, WaitingOrder } from '../agents/dispatchWatcher';
import { AGENTS, DISPATCH_WATCHER } from '../agents/agentRegistry';
import { AGENT_ACTIONS, isStale } from '../agents/agentActions';

const settings = { ...AGENTS[DISPATCH_WATCHER].defaults.settings }; // 5 / 10 / 25 min
const now = new Date('2026-10-09T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

const order = (waitedMin: number, id = 'o1'): WaitingOrder => ({
  id, orderNumber: `GBM-${id}`, vendorName: 'Mama Put', fee: 800, waitingSince: ago(waitedMin),
});
const plan = (waiting: WaitingOrder[], candidates = new Map<string, Candidate[]>()) =>
  planDispatch({ now, settings, waiting, candidates, stalledDeliveries: [], stalledPreparing: [] });

describe('planDispatch — order waiting for a rider', () => {
  it('does nothing before the first threshold', () => {
    expect(plan([order(4)])).toEqual([]);
  });

  it('alerts nearby riders first', () => {
    const out = plan([order(6)]);
    expect(out.map((p) => p.action)).toEqual(['NOTIFY_RIDERS']);
    expect(out[0].payload).toMatchObject({ radiusKm: settings.notifyRadiusKm, maxRiders: settings.maxRidersPerAlert, fee: 800 });
  });

  it('then proposes the nearest available rider, preferring available over merely online', () => {
    const candidates = new Map([['o1', [
      { id: 'busy', name: 'Bayo', isAvailable: false, distanceKm: 0.5 },
      { id: 'free', name: 'Chidi', isAvailable: true, distanceKm: 2.1 },
    ]]]);
    const assign = plan([order(12)], candidates).find((p) => p.action === 'ASSIGN_RIDER')!;
    expect(assign.payload).toMatchObject({ riderId: 'free', riderName: 'Chidi' });
    expect(assign.title).toBe('Assign Chidi (2.1 km away) to #GBM-o1');
  });

  it('skips the assignment when there are no candidates, and later proposes cancelling', () => {
    expect(plan([order(12)]).map((p) => p.action)).toEqual(['NOTIFY_RIDERS']);
    const late = plan([order(30)]);
    expect(late.map((p) => p.action)).toEqual(['NOTIFY_RIDERS', 'CANCEL_ORDER']);
    expect(late[1].reason).toContain('no riders are online nearby');
  });

  it('uses one dedupe key per order per waiting episode, so each stage is proposed once', () => {
    const first = plan([order(30)]);
    const again = plan([order(30)]);
    expect(first.map((p) => p.dedupeKey)).toEqual(again.map((p) => p.dedupeKey));
    const newEpisode = plan([{ ...order(30), waitingSince: ago(29) }]);
    expect(newEpisode[0].dedupeKey).not.toBe(first[0].dedupeKey);
  });

  it('every proposal is a valid payload for its action', () => {
    const out = planDispatch({
      now, settings,
      waiting: [order(30)],
      candidates: new Map([['o1', [{ id: 'r', name: 'R', isAvailable: true, distanceKm: 1 }]]]),
      stalledDeliveries: [{ id: 'd', orderNumber: 'GBM-d', status: OrderStatus.PICKED_UP, since: ago(70), contactName: 'Tunde', phone: '0803' }],
      stalledPreparing: [{ id: 'p', orderNumber: 'GBM-p', status: OrderStatus.PREPARING, since: ago(50), contactName: 'Iya Basira', phone: null }],
    });
    expect(out.map((p) => p.action)).toEqual(['NOTIFY_RIDERS', 'ASSIGN_RIDER', 'CANCEL_ORDER', 'FOLLOW_UP', 'FOLLOW_UP']);
    for (const p of out) {
      expect(AGENT_ACTIONS[p.action].schema.validate(p.payload).error).toBeUndefined();
    }
    expect(out[3].title).toBe('Call rider Tunde about #GBM-d (70 min since pickup)');
  });
});

describe('isStale', () => {
  const waitingForRider = { statuses: [OrderStatus.READY], noRider: true };

  it('keeps a suggestion while the order is still waiting', () => {
    expect(isStale(waitingForRider, { status: OrderStatus.READY, riderId: null })).toBe(false);
  });

  it('expires it once a rider takes the job, the status moves on, or the order is gone', () => {
    expect(isStale(waitingForRider, { status: OrderStatus.READY, riderId: 'r1' })).toBe(true);
    expect(isStale(waitingForRider, { status: OrderStatus.CANCELLED, riderId: null })).toBe(true);
    expect(isStale(waitingForRider, null)).toBe(true);
  });
});

describe('action safety', () => {
  it('cancelling can never be made automatic', () => {
    expect(AGENT_ACTIONS.CANCEL_ORDER.autoAllowed).toBe(false);
  });

  it('defaults the watcher to auto-run only rider alerts', () => {
    expect(AGENTS[DISPATCH_WATCHER].defaults.autoActions).toEqual(['NOTIFY_RIDERS']);
  });
});
