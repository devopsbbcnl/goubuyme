/**
 * Removes all demo data seeded by seed-demo.ts.
 * Matches any email containing '@demo.gobuyme.' so it works regardless
 * of which TLD was active when the seed ran (.test, .ng, etc).
 * Run: npm run demo:unseed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function unseedDemo() {
  console.log('🗑️  Removing all demo data...\n');

  const demoUsers = await prisma.user.findMany({
    where: { email: { contains: '@demo.gobuyme.' } },
    include: {
      customer: { include: { orders: true } },
      vendor:   { include: { orders: true } },
      rider:    { include: { deliveries: true } },
    },
  });

  console.log(`Found ${demoUsers.length} demo user(s): ${demoUsers.map(u => u.email).join(', ')}\n`);

  if (!demoUsers.length) {
    console.log('ℹ️  No demo data found. Nothing to remove.');
    return;
  }

  const userIds     = demoUsers.map(u => u.id);
  const vendorIds   = demoUsers.flatMap(u => u.vendor   ? [u.vendor.id]   : []);
  const riderIds    = demoUsers.flatMap(u => u.rider    ? [u.rider.id]    : []);
  const customerIds = demoUsers.flatMap(u => u.customer ? [u.customer.id] : []);

  // Collect all order IDs touched by demo users (customer, vendor, or rider side)
  const orderIds = [
    ...demoUsers.flatMap(u => u.customer?.orders.map(o => o.id) ?? []),
    ...demoUsers.flatMap(u => u.vendor?.orders.map(o => o.id)   ?? []),
    ...demoUsers.flatMap(u => u.rider?.deliveries.map(o => o.id) ?? []),
  ];
  const uniqueOrderIds = [...new Set(orderIds)];

  // ── Delete in FK-safe order ───────────────────────────────────────────────

  // 1. Order children
  if (uniqueOrderIds.length) {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: uniqueOrderIds } } });
    await prisma.earning.deleteMany({ where: { orderId: { in: uniqueOrderIds } } });
    await prisma.vendorPayout.deleteMany({ where: { orderId: { in: uniqueOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: uniqueOrderIds } } });
    console.log(`✓ Deleted ${uniqueOrderIds.length} orders and their items/earnings/payouts`);
  }

  // 2. Customer data
  if (customerIds.length) {
    await prisma.cartItem.deleteMany({ where: { cart: { customerId: { in: customerIds } } } });
    await prisma.cart.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.favorite.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.address.deleteMany({ where: { customerId: { in: customerIds } } });
    console.log(`✓ Deleted cart, favorites, and addresses for ${customerIds.length} customer(s)`);
  }

  // 3. Vendor data
  if (vendorIds.length) {
    await prisma.vendorPromotion.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendorLicense.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendorBusinessVerification.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendorDocument.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.menuItem.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.payoutAccount.deleteMany({ where: { vendorId: { in: vendorIds } } });
    console.log(`✓ Deleted menus, verifications, and payout accounts for ${vendorIds.length} vendor(s)`);
  }

  // 4. Rider data
  if (riderIds.length) {
    await prisma.riderDocument.deleteMany({ where: { riderId: { in: riderIds } } });
    await prisma.payoutAccount.deleteMany({ where: { riderId: { in: riderIds } } });
    console.log(`✓ Deleted documents and payout accounts for ${riderIds.length} rider(s)`);
  }

  // 5. Shared user data
  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
  }

  // 6. Platform offers seeded by demo
  const deletedOffers = await prisma.offer.deleteMany({
    where: { code: { in: ['DEMO-FIRSTORDER', 'DEMO-GROCERY500'] } },
  });
  if (deletedOffers.count) console.log(`✓ Deleted ${deletedOffers.count} demo offer(s)`);

  // 7. Users (cascades to Customer / Vendor / Rider rows)
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`✓ Deleted ${userIds.length} demo user(s)`);

  console.log('\n✅ All demo data removed. Database is clean for production.\n');
}

unseedDemo()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
