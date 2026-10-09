import { AgentMode, OrderEventType, OrderStatus } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { getCandidateRiders } from '../orderLifecycle.service';
import { ProposeInput, announceSuggestions, expireStaleSuggestions, getAgentConfig, proposeAction } from './agentRuntime.service';
import { AGENTS, DISPATCH_WATCHER } from './agentRegistry';

// Dispatch watcher agent (rule-based, no LLM). Each tick it looks at live orders and, per order
// and per "episode" (each time an order starts waiting for a rider), escalates once per stage:
//   waiting ≥ notifyAfter   → alert nearby available riders (auto by default)
//   waiting ≥ assignAfter   → propose the nearest suitable rider
//   waiting ≥ cancelAfter   → propose cancelling with a refund
// It also flags deliveries and vendors that have stalled so someone can call them.

export interface WaitingOrder {
  id: string;
  orderNumber: string;
  vendorName: string;
  fee: number;
  waitingSince: Date;
}

export interface Candidate {
  id: string;
  name: string;
  isAvailable: boolean;
  distanceKm: number | null;
}

export interface StalledOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  since: Date;
  contactName: string;
  phone: string | null;
}

export type DispatchSettings = typeof AGENTS[typeof DISPATCH_WATCHER]['defaults']['settings'];

const minutesSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / 60_000);
const WAITING_FOR_RIDER = { statuses: [OrderStatus.READY], noRider: true };

/** Pure: decides what to propose. `candidates` is only needed for orders past the assign threshold. */
export function planDispatch(input: {
  now: Date;
  settings: DispatchSettings;
  waiting: WaitingOrder[];
  candidates: Map<string, Candidate[]>;
  stalledDeliveries: StalledOrder[];
  stalledPreparing: StalledOrder[];
}): Omit<ProposeInput, 'agentKey' | 'ttlMinutes'>[] {
  const { now, settings: s } = input;
  const out: Omit<ProposeInput, 'agentKey' | 'ttlMinutes'>[] = [];

  for (const o of input.waiting) {
    const waited = minutesSince(o.waitingSince, now);
    const episode = o.waitingSince.getTime();

    if (waited >= s.notifyAfterMinutes) {
      out.push({
        action: 'NOTIFY_RIDERS',
        title: `Alert riders near ${o.vendorName} about #${o.orderNumber}`,
        reason: `Order #${o.orderNumber} has been ready for ${waited} min with no rider.`,
        payload: {
          orderId: o.id, when: WAITING_FOR_RIDER, orderNumber: o.orderNumber, vendorName: o.vendorName,
          fee: o.fee, radiusKm: s.notifyRadiusKm, maxRiders: s.maxRidersPerAlert,
        },
        dedupeKey: `notify:${o.id}:${episode}`,
      });
    }

    if (waited >= s.suggestAssignAfterMinutes) {
      const pool = input.candidates.get(o.id) ?? [];
      // Prefer riders who've marked themselves available; nearest first (candidates arrive sorted).
      const best = pool.find((r) => r.isAvailable) ?? pool[0];
      if (best) {
        const where = best.distanceKm != null ? `${best.distanceKm} km away` : 'location unknown';
        out.push({
          action: 'ASSIGN_RIDER',
          title: `Assign ${best.name} (${where}) to #${o.orderNumber}`,
          reason: `Ready for ${waited} min and no rider has accepted. ${best.name} is the nearest ${best.isAvailable ? 'available' : 'online'} rider (${where}).`,
          payload: { orderId: o.id, when: WAITING_FOR_RIDER, riderId: best.id, riderName: best.name },
          dedupeKey: `assign:${o.id}:${episode}`,
        });
      }
    }

    if (waited >= s.suggestCancelAfterMinutes) {
      const noRiders = (input.candidates.get(o.id) ?? []).length === 0;
      out.push({
        action: 'CANCEL_ORDER',
        title: `Cancel #${o.orderNumber} — no rider for ${waited} min`,
        reason: `Order #${o.orderNumber} from ${o.vendorName} has waited ${waited} min for a rider${noRiders ? ' and no riders are online nearby' : ''}. Cancelling refunds the customer as store credit; consider calling them first.`,
        payload: { orderId: o.id, when: WAITING_FOR_RIDER, reason: `No rider available after ${waited} minutes` },
        dedupeKey: `cancel:${o.id}:${episode}`,
      });
    }
  }

  for (const d of input.stalledDeliveries) {
    const mins = minutesSince(d.since, now);
    out.push({
      action: 'FOLLOW_UP',
      title: `Call rider ${d.contactName} about #${d.orderNumber} (${mins} min since pickup)`,
      reason: `Order #${d.orderNumber} was picked up ${mins} min ago and hasn't been delivered. Check on the rider${d.phone ? ` (${d.phone})` : ''} and the customer.`,
      payload: { orderId: d.id, when: { statuses: [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT] }, kind: 'delivery', contactName: d.contactName, phone: d.phone },
      dedupeKey: `delivery:${d.id}:${d.since.getTime()}`,
    });
  }

  for (const p of input.stalledPreparing) {
    const mins = minutesSince(p.since, now);
    out.push({
      action: 'FOLLOW_UP',
      title: `Call ${p.contactName} about #${p.orderNumber} (preparing ${mins} min)`,
      reason: `${p.contactName} accepted order #${p.orderNumber} ${mins} min ago and hasn't marked it ready. Check whether it's delayed${p.phone ? ` (${p.phone})` : ''} and update the customer.`,
      payload: { orderId: p.id, when: { statuses: [OrderStatus.PREPARING] }, kind: 'vendor', contactName: p.contactName, phone: p.phone },
      dedupeKey: `preparing:${p.id}:${p.since.getTime()}`,
    });
  }

  return out;
}

async function collect(now: Date, s: DispatchSettings) {
  const lookback = new Date(now.getTime() - s.lookbackHours * 3_600_000);
  const recent = { OR: [{ statusChangedAt: { gte: lookback } }, { statusChangedAt: null, updatedAt: { gte: lookback } }] };

  const ready = await prisma.order.findMany({
    where: { status: OrderStatus.READY, riderId: null, ...recent },
    select: {
      id: true, orderNumber: true, originalDeliveryFee: true, statusChangedAt: true, updatedAt: true,
      vendor: { select: { businessName: true } },
    },
    take: 200,
  });

  // An order can wait for a rider more than once (e.g. an admin removed the rider), so measure
  // from the latest time it became ready or lost its rider.
  const events = ready.length
    ? await prisma.orderEvent.findMany({
      where: {
        orderId: { in: ready.map((o) => o.id) },
        OR: [{ type: OrderEventType.STATUS_CHANGED, toStatus: OrderStatus.READY }, { type: OrderEventType.RIDER_UNASSIGNED }],
      },
      select: { orderId: true, createdAt: true },
    })
    : [];
  const latest = new Map<string, Date>();
  for (const e of events) {
    const prev = latest.get(e.orderId);
    if (!prev || e.createdAt > prev) latest.set(e.orderId, e.createdAt);
  }
  const waiting: WaitingOrder[] = ready.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    vendorName: o.vendor.businessName,
    fee: o.originalDeliveryFee,
    waitingSince: latest.get(o.id) ?? o.statusChangedAt ?? o.updatedAt,
  }));

  const candidates = new Map<string, Candidate[]>();
  for (const o of waiting) {
    if (minutesSince(o.waitingSince, now) >= s.suggestAssignAfterMinutes) {
      candidates.set(o.id, await getCandidateRiders(o.id));
    }
  }

  const stalledWindow = (minutes: number) => ({ gte: lookback, lt: new Date(now.getTime() - minutes * 60_000) });
  const [deliveries, preparing] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT] }, statusChangedAt: stalledWindow(s.deliveryStallMinutes) },
      select: { id: true, orderNumber: true, status: true, statusChangedAt: true, rider: { select: { user: { select: { name: true, phone: true } } } } },
      take: 100,
    }),
    prisma.order.findMany({
      where: { status: OrderStatus.PREPARING, statusChangedAt: stalledWindow(s.preparingStallMinutes) },
      select: { id: true, orderNumber: true, status: true, statusChangedAt: true, vendor: { select: { businessName: true, user: { select: { phone: true } } } } },
      take: 100,
    }),
  ]);

  return {
    waiting,
    candidates,
    stalledDeliveries: deliveries.map((d) => ({
      id: d.id, orderNumber: d.orderNumber, status: d.status, since: d.statusChangedAt!,
      contactName: d.rider?.user.name ?? 'the rider', phone: d.rider?.user.phone ?? null,
    })),
    stalledPreparing: preparing.map((p) => ({
      id: p.id, orderNumber: p.orderNumber, status: p.status, since: p.statusChangedAt!,
      contactName: p.vendor.businessName, phone: p.vendor.user.phone ?? null,
    })),
  };
}

/** One watcher pass. Safe to run concurrently on several servers (suggestions are de-duplicated). */
export async function runDispatchWatcherTick(now = new Date()) {
  await expireStaleSuggestions();
  const config = await getAgentConfig(DISPATCH_WATCHER);
  if (config.mode === AgentMode.OFF) return { proposed: 0 };

  const settings = config.settings as DispatchSettings;
  const plan = planDispatch({ now, settings, ...(await collect(now, settings)) });

  const created = [];
  for (const p of plan) {
    const s = await proposeAction({ ...p, agentKey: DISPATCH_WATCHER, ttlMinutes: settings.suggestionTtlMinutes }, config);
    if (s) created.push(s);
  }
  if (created.length) {
    logger.info(`Dispatch watcher: ${created.length} new suggestion(s)`, {
      auto: created.filter((s) => s.autoExecuted).length,
    });
    await announceSuggestions(AGENTS[DISPATCH_WATCHER].name, created);
  }
  return { proposed: created.length };
}
