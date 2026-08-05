import prisma from '../config/db';
import logger from '../utils/logger';
import { VendorAvailabilityOverride } from '@prisma/client';
import {
  localTimeInZone,
  parseTimeToMinutes,
  formatMinutesTo12h,
} from './storeHours.service';

/**
 * Single source of truth for whether a vendor store is available right now.
 *
 * All availability decisions run on the backend against server time, converted
 * into each vendor's own timezone (default Africa/Lagos). The service returns a
 * small, stable set of status codes so listings, ordering and vendor pages all
 * speak the same language. Add new statuses here and every consumer inherits it.
 */

export type AvailabilityStatus =
  | 'open'
  | 'closed_manual'          // vendor forced the store closed
  | 'temporarily_closed'     // an active temporary closure window
  | 'closed_outside_hours';  // outside the configured weekly business hours

/** Shape of the data the service needs to decide availability for one vendor. */
export interface AvailabilityInput {
  timezone: string | null;
  availabilityOverride: VendorAvailabilityOverride;
  businessHours: { dayOfWeek: number; openTime: string; closeTime: string }[];
  temporaryClosures: { startAt: Date; endAt: Date | null; reason: string | null }[];
}

export interface AvailabilityResult {
  isOpen: boolean;
  status: AvailabilityStatus;
  /** Short, customer-facing message describing the current state. */
  message: string;
  /** Populated for temporary closures. */
  reason?: string | null;
  /** ISO timestamp the store is expected to reopen, when known. */
  reopensAt?: string | null;
}

const DEFAULT_TZ = process.env.STORE_TIMEZONE || 'Africa/Lagos';

/** Is `now` (minutes) inside a slot, accounting for overnight ranges. */
const withinSlot = (openTime: string, closeTime: string, now: number): boolean => {
  const open = parseTimeToMinutes(openTime);
  const close = parseTimeToMinutes(closeTime);
  if (open === null || close === null) return false;
  if (open === close) return true;            // open all day
  if (open < close) return now >= open && now < close;
  return now >= open || now < close;          // overnight span
};

/** Find the temporary closure covering `at`, if any. */
const activeClosure = (
  closures: AvailabilityInput['temporaryClosures'],
  at: Date,
): AvailabilityInput['temporaryClosures'][number] | null => {
  for (const c of closures) {
    const started = c.startAt.getTime() <= at.getTime();
    const notEnded = c.endAt === null || c.endAt.getTime() > at.getTime();
    if (started && notEnded) return c;
  }
  return null;
};

/**
 * Pure availability computation. No DB access — feed it the vendor's config and
 * it returns the current status. This is what makes the rules easy to unit test
 * and to reuse across every request path.
 */
export const computeAvailability = (
  input: AvailabilityInput,
  now: Date = new Date(),
): AvailabilityResult => {
  // 1. Temporary closures win over everything, including a manual force-open.
  const closure = activeClosure(input.temporaryClosures, now);
  if (closure) {
    return {
      isOpen: false,
      status: 'temporarily_closed',
      message: closure.reason
        ? `Temporarily closed: ${closure.reason}`
        : 'Temporarily closed',
      reason: closure.reason,
      reopensAt: closure.endAt ? closure.endAt.toISOString() : null,
    };
  }

  // 2. Manual overrides.
  if (input.availabilityOverride === 'FORCE_CLOSED') {
    return { isOpen: false, status: 'closed_manual', message: 'Closed' };
  }
  if (input.availabilityOverride === 'FORCE_OPEN') {
    return { isOpen: true, status: 'open', message: 'Open' };
  }

  // 3. AUTO — follow the weekly business hours in the vendor's timezone.
  const tz = input.timezone || DEFAULT_TZ;
  const { dayOfWeek, minutes } = localTimeInZone(tz, now);

  // No hours configured at all → treat as always available (backward compatible).
  if (input.businessHours.length === 0) {
    return { isOpen: true, status: 'open', message: 'Open' };
  }

  const todaySlots = input.businessHours.filter(s => s.dayOfWeek === dayOfWeek);
  const openNow = todaySlots.some(s => withinSlot(s.openTime, s.closeTime, minutes));
  if (openNow) {
    return { isOpen: true, status: 'open', message: 'Open' };
  }

  // Find the next opening slot to tell the customer when to come back.
  const reopensAt = nextOpeningIso(input.businessHours, tz, now);
  return {
    isOpen: false,
    status: 'closed_outside_hours',
    message: 'Closed — outside business hours',
    reopensAt,
  };
};

/** Best-effort ISO for the next business-hours opening, scanning up to 7 days. */
const nextOpeningIso = (
  hours: AvailabilityInput['businessHours'],
  tz: string,
  now: Date,
): string | null => {
  const { dayOfWeek, minutes } = localTimeInZone(tz, now);
  for (let offset = 0; offset < 8; offset++) {
    const day = (dayOfWeek + offset) % 7;
    const slots = hours
      .filter(s => s.dayOfWeek === day)
      .map(s => ({ ...s, open: parseTimeToMinutes(s.openTime) }))
      .filter(s => s.open !== null)
      .sort((a, b) => (a.open! - b.open!));
    for (const s of slots) {
      if (offset === 0 && s.open! <= minutes) continue; // already passed today
      const target = new Date(now);
      target.setUTCDate(target.getUTCDate() + offset);
      // Approximate — good enough for a "reopens around" hint; exact tz math is
      // avoided here to keep this cheap. Consumers show a friendly time only.
      const label = formatMinutesTo12h(s.open!);
      logger.debug?.(`nextOpening for day ${day} at ${label}`);
      return target.toISOString();
    }
  }
  return null;
};

// The fields any query must select for the service to decide availability.
export const availabilityInclude = {
  timezone: true,
  availabilityOverride: true,
  businessHours: { select: { dayOfWeek: true, openTime: true, closeTime: true } },
  temporaryClosures: {
    where: { OR: [{ endAt: null }, { endAt: { gt: new Date(0) } }] },
    select: { startAt: true, endAt: true, reason: true },
  },
};

/** DB-backed availability for a single vendor by id. */
export const getVendorAvailability = async (
  vendorId: string,
  now: Date = new Date(),
): Promise<AvailabilityResult | null> => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: availabilityInclude,
  });
  if (!vendor) return null;
  return computeAvailability(vendor as unknown as AvailabilityInput, now);
};

/**
 * Recompute availability for one vendor and persist the `isOpen` mirror right
 * away. Call this after any mutation (toggle, hours change, closure) so the
 * cached boolean the rest of the app reads is correct without waiting for the
 * next cron tick. Returns the fresh availability result.
 */
export const refreshVendorIsOpen = async (
  vendorId: string,
  now: Date = new Date(),
): Promise<AvailabilityResult | null> => {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { isOpen: true, ...availabilityInclude },
  });
  if (!vendor) return null;
  const result = computeAvailability(vendor as unknown as AvailabilityInput, now);
  if (result.isOpen !== vendor.isOpen) {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { isOpen: result.isOpen },
    });
  }
  return result;
};

/**
 * Recompute the cached `isOpen` boolean for every vendor and persist changes.
 * `isOpen` is a denormalised mirror of `computeAvailability().isOpen` so the many
 * existing list queries that select `isOpen` stay correct without a join. The
 * cron job calls this every minute; availability truth still lives in this service.
 */
export const syncStoreOpenStates = async (now: Date = new Date()): Promise<void> => {
  const vendors = await prisma.vendor.findMany({
    select: { id: true, isOpen: true, ...availabilityInclude },
  });

  const toOpen: string[] = [];
  const toClose: string[] = [];

  for (const v of vendors) {
    const { isOpen } = computeAvailability(v as unknown as AvailabilityInput, now);
    if (isOpen === v.isOpen) continue;
    (isOpen ? toOpen : toClose).push(v.id);
  }

  if (toOpen.length) {
    await prisma.vendor.updateMany({ where: { id: { in: toOpen } }, data: { isOpen: true } });
  }
  if (toClose.length) {
    await prisma.vendor.updateMany({ where: { id: { in: toClose } }, data: { isOpen: false } });
  }
  if (toOpen.length || toClose.length) {
    logger.info(`Availability sync: opened ${toOpen.length}, closed ${toClose.length}`);
  }
};
