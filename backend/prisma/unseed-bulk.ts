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

  const { count } = await prisma.user.deleteMany({
    where: { email: { endsWith: `@${BULK_DOMAIN}` } },
  });

  console.log(`✅ Deleted ${count} user accounts (vendors + menu items cascade-deleted).`);
}

unseedBulk()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
