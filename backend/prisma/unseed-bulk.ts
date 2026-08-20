/**
 * Bulk unseed — removes all users/vendors seeded by seed-bulk.ts.
 * Deletes by email domain @bulk.gobuyme.ng. Cascades to Vendor + MenuItems.
 *
 * Run: npm run bulk:unseed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BULK_DOMAIN = 'bulk.gobuyme.ng';

async function unseedBulk() {
  console.log(`🗑️  Removing all bulk seed data (@${BULK_DOMAIN})...`);

  const bulkUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${BULK_DOMAIN}` } },
    select: { id: true },
  });
  const bulkUserIds = bulkUsers.map(u => u.id);

  const bulkVendors = await prisma.vendor.findMany({
    where: { userId: { in: bulkUserIds } },
    select: { id: true },
  });
  const bulkVendorIds = bulkVendors.map(v => v.id);

  // Orders (and Earning/VendorPayout/Conversation) reference vendorId without
  // onDelete: Cascade — real orders placed against these seed vendors block
  // `User.deleteMany` with a foreign key violation unless removed first.
  const bulkOrders = await prisma.order.findMany({
    where: { vendorId: { in: bulkVendorIds } },
    select: { id: true },
  });
  const bulkOrderIds = bulkOrders.map(o => o.id);

  if (bulkOrderIds.length > 0) {
    await prisma.earning.deleteMany({ where: { orderId: { in: bulkOrderIds } } });
    await prisma.vendorPayout.deleteMany({ where: { orderId: { in: bulkOrderIds } } });
    await prisma.conversation.deleteMany({ where: { orderId: { in: bulkOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: bulkOrderIds } } });
    console.log(`🗑️  Deleted ${bulkOrderIds.length} orders (and their earnings/payouts/conversations) referencing bulk vendors.`);
  }

  const { count } = await prisma.user.deleteMany({
    where: { id: { in: bulkUserIds } },
  });

  console.log(`✅ Deleted ${count} user accounts (vendors + menu items cascade-deleted).`);
}

unseedBulk()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
