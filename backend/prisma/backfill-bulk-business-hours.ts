/**
 * Backfill VendorBusinessHours for vendors created by seed-bulk.ts.
 *
 * seed-bulk.ts predates the weekly business-hours system (added in the
 * "hardening of open/close time for vendors" change) and only sets
 * Vendor.openingTime / Vendor.closingTime. With zero VendorBusinessHours rows,
 * availability.service.ts treats those vendors as always open — this script
 * gives them real hours by writing one row per weekday (0=Sun..6=Sat) using
 * their existing openingTime/closingTime.
 *
 * Idempotent: only touches bulk vendors that have openingTime/closingTime set
 * and currently have zero VendorBusinessHours rows, so re-running is safe and
 * it won't clobber hours anyone has since customized by hand.
 *
 * Run:   npm run bulk:backfill-hours
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BULK_DOMAIN = 'bulk.gobuyme.ng';

async function backfillBulkBusinessHours() {
  console.log(`🕐 Backfilling business hours for @${BULK_DOMAIN} vendors...\n`);

  const vendors = await prisma.vendor.findMany({
    where: {
      user: { email: { endsWith: `@${BULK_DOMAIN}` } },
      openingTime: { not: null },
      closingTime: { not: null },
      businessHours: { none: {} },
    },
    select: { id: true, businessName: true, openingTime: true, closingTime: true },
  });

  console.log(`Found ${vendors.length} bulk vendor(s) missing business hours.`);

  let updated = 0;
  for (const vendor of vendors) {
    await prisma.vendorBusinessHours.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        vendorId: vendor.id,
        dayOfWeek,
        openTime: vendor.openingTime!,
        closeTime: vendor.closingTime!,
      })),
    });
    updated++;
  }

  console.log(`\n✅ Backfill complete! Business hours written for ${updated} vendor(s).`);
}

backfillBulkBusinessHours()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
