/**
 * Backfill OnboardingEvent rows for users who signed up BEFORE event tracking
 * existed, reconstructing each transition from current state. Timestamps are
 * best-effort (some steps have no recorded time, so we approximate with
 * updatedAt). Safe to re-run — createMany + skipDuplicates relies on the
 * unique (userId, event) constraint, so already-tracked users are untouched.
 *
 * Run once after applying the migration:
 *   npx ts-node prisma/backfill-onboarding-events.ts
 */
import { PrismaClient, Role, OnboardingEventType } from '@prisma/client';

const prisma = new PrismaClient();

type Row = { userId: string; role: Role; event: OnboardingEventType; createdAt: Date };

async function main() {
  const rows: Row[] = [];

  // ── Vendors ────────────────────────────────────────────────────────────────
  const vendors = await prisma.vendor.findMany({
    select: {
      userId: true, logo: true, coverImage: true, approvalStatus: true, updatedAt: true,
      user: { select: { createdAt: true, isEmailVerified: true, updatedAt: true } },
      document: { select: { createdAt: true } },
    },
  });
  for (const v of vendors) {
    rows.push({ userId: v.userId, role: Role.VENDOR, event: OnboardingEventType.SIGNED_UP, createdAt: v.user.createdAt });
    if (v.user.isEmailVerified)
      rows.push({ userId: v.userId, role: Role.VENDOR, event: OnboardingEventType.EMAIL_VERIFIED, createdAt: v.user.updatedAt });
    if (v.logo && v.coverImage)
      rows.push({ userId: v.userId, role: Role.VENDOR, event: OnboardingEventType.VENDOR_PROFILE_COMPLETED, createdAt: v.updatedAt });
    if (v.document)
      rows.push({ userId: v.userId, role: Role.VENDOR, event: OnboardingEventType.DOCUMENTS_SUBMITTED, createdAt: v.document.createdAt });
    if (v.approvalStatus === 'APPROVED')
      rows.push({ userId: v.userId, role: Role.VENDOR, event: OnboardingEventType.APPROVED, createdAt: v.updatedAt });
  }

  // ── Riders ─────────────────────────────────────────────────────────────────
  const riders = await prisma.rider.findMany({
    select: {
      userId: true, approvalStatus: true, updatedAt: true,
      user: { select: { createdAt: true, isEmailVerified: true, updatedAt: true } },
      document: { select: { createdAt: true } },
    },
  });
  for (const r of riders) {
    rows.push({ userId: r.userId, role: Role.RIDER, event: OnboardingEventType.SIGNED_UP, createdAt: r.user.createdAt });
    if (r.user.isEmailVerified)
      rows.push({ userId: r.userId, role: Role.RIDER, event: OnboardingEventType.EMAIL_VERIFIED, createdAt: r.user.updatedAt });
    if (r.document)
      rows.push({ userId: r.userId, role: Role.RIDER, event: OnboardingEventType.DOCUMENTS_SUBMITTED, createdAt: r.document.createdAt });
    if (r.approvalStatus === 'APPROVED')
      rows.push({ userId: r.userId, role: Role.RIDER, event: OnboardingEventType.APPROVED, createdAt: r.updatedAt });
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  const customers = await prisma.customer.findMany({
    select: {
      userId: true,
      user: { select: { createdAt: true, isEmailVerified: true, updatedAt: true } },
      orders: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  for (const c of customers) {
    rows.push({ userId: c.userId, role: Role.CUSTOMER, event: OnboardingEventType.SIGNED_UP, createdAt: c.user.createdAt });
    if (c.user.isEmailVerified)
      rows.push({ userId: c.userId, role: Role.CUSTOMER, event: OnboardingEventType.EMAIL_VERIFIED, createdAt: c.user.updatedAt });
    if (c.orders[0])
      rows.push({ userId: c.userId, role: Role.CUSTOMER, event: OnboardingEventType.FIRST_ORDER, createdAt: c.orders[0].createdAt });
  }

  // Insert in chunks; skipDuplicates leaves any already-tracked events in place.
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.onboardingEvent.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    inserted += res.count;
  }

  console.log(`Backfill complete: ${rows.length} candidate events, ${inserted} newly inserted.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
