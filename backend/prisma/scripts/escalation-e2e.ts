/* TEMP manual-test helper for the vendor order-response escalation job. Safe to delete. */
import prisma from '../../src/config/db';

const VENDOR_NAME = 'Ugonna Kitchen';

async function seedOrder() {
  const vendor = await prisma.vendor.findFirst({
    where: { businessName: VENDOR_NAME },
    include: {
      user: true,
      menuItems: { where: { isAvailable: true, stockQuantity: { gte: 2 } }, take: 1 },
    },
  });
  if (!vendor) throw new Error(`vendor "${VENDOR_NAME}" not found`);
  if (!vendor.menuItems.length) throw new Error('no in-stock menu item for that vendor');
  const customer = await prisma.customer.findFirst({ include: { user: true } });
  if (!customer) throw new Error('no customer found');

  const item = vendor.menuItems[0];
  const stockBefore = item.stockQuantity;
  const order = await prisma.order.create({
    data: {
      orderNumber: `E2E-${Date.now().toString().slice(-8)}`,
      deliveryPin: String(Math.floor(1000 + Math.random() * 9000)),
      customerId: customer.id,
      vendorId: vendor.id,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      subtotal: item.price * 2,
      deliveryFee: 500,
      originalDeliveryFee: 500,
      platformFee: 0,
      totalAmount: item.price * 2 + 500,
      paymentMethod: 'CASH_ON_DELIVERY',
      deliveryAddress: '1 Test Street, Lagos',
      deliveryLatitude: 6.5244,
      deliveryLongitude: 3.3792,
      stockReserved: true,
      vendorNotifiedAt: new Date(),
      estimatedTime: 30,
      items: { create: [{ menuItemId: item.id, name: item.name, price: item.price, quantity: 2 }] },
    },
  });
  await prisma.menuItem.update({ where: { id: item.id }, data: { stockQuantity: { decrement: 2 } } });
  console.log('created order', {
    id: order.id, orderNumber: order.orderNumber,
    vendor: vendor.businessName, vendorPhone: vendor.user.phone, timezone: vendor.timezone,
    menuItem: item.name, stockBefore, stockAfter: stockBefore - 2,
  });
}

async function status(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true, status: true, paymentStatus: true,
      vendorNotifiedAt: true, vendorViewedAt: true, reminderSentAt: true,
      urgentSentAt: true, autoCancelledAt: true, cancelReason: true,
      creditIssued: true, stockReserved: true,
      items: { select: { name: true, quantity: true, menuItem: { select: { stockQuantity: true } } } },
    },
  });
  console.dir(o, { depth: null });
  const incidents = await prisma.vendorIncident.findMany({ where: { orderId } });
  console.log('incidents:', incidents);
}

async function backdate(orderId: string, minutes: number) {
  const when = new Date(Date.now() - minutes * 60_000);
  await prisma.order.update({ where: { id: orderId }, data: { vendorNotifiedAt: when } });
  console.log(`vendorNotifiedAt set to ${when.toISOString()} (${minutes}m ago) for ${orderId}`);
}

async function setTz(tz: string) {
  const v = await prisma.vendor.findFirst({ where: { businessName: VENDOR_NAME }, select: { id: true, timezone: true } });
  if (!v) throw new Error('vendor not found');
  await prisma.vendor.update({ where: { id: v.id }, data: { timezone: tz } });
  console.log(`vendor timezone: ${v.timezone} -> ${tz}`);
}

async function cleanup() {
  const orders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: 'E2E-' } },
    select: {
      id: true, orderNumber: true, creditIssued: true, stockReserved: true,
      customer: { select: { userId: true } },
      items: { select: { menuItemId: true, quantity: true } },
    },
  });
  console.log(`found ${orders.length} E2E test orders`);
  for (const o of orders) {
    if (o.creditIssued > 0) {
      await prisma.user.update({
        where: { id: o.customer.userId },
        data: { storeCreditBalance: { decrement: o.creditIssued } },
      });
      console.log(`  reversed ₦${o.creditIssued} store credit for ${o.orderNumber}`);
    }
    if (o.stockReserved) {
      for (const it of o.items) {
        await prisma.menuItem.update({
          where: { id: it.menuItemId },
          data: { stockQuantity: { increment: it.quantity } },
        });
      }
      console.log(`  returned reserved stock for ${o.orderNumber}`);
    }
    await prisma.creditTransaction.deleteMany({ where: { orderId: o.id } });
    await prisma.vendorIncident.deleteMany({ where: { orderId: o.id } });
  }
  const del = await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'E2E-' } } });
  console.log(`  deleted ${del.count} orders (+ cascaded items)`);

  const orderIds = new Set(orders.map((o) => o.id));
  const stale = await prisma.notification.findMany({
    where: { type: { in: ['order', 'store_credit'] }, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } },
    select: { id: true, meta: true },
  });
  const toDrop = stale.filter((n) => {
    const m = (n.meta ?? {}) as Record<string, unknown>;
    return typeof m.orderId === 'string' && orderIds.has(m.orderId);
  });
  if (toDrop.length) {
    await prisma.notification.deleteMany({ where: { id: { in: toDrop.map((n) => n.id) } } });
    console.log(`  deleted ${toDrop.length} test notifications`);
  }

  const staleErrors = await prisma.errorLog.findMany({
    where: { source: { in: ['whatsapp', 'sms'] }, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } },
    select: { id: true },
  });
  if (staleErrors.length) {
    await prisma.errorLog.deleteMany({ where: { id: { in: staleErrors.map((e) => e.id) } } });
    console.log(`  deleted ${staleErrors.length} test error_logs (whatsapp/sms)`);
  }
  console.log('cleanup done.');
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'seed') await seedOrder();
  else if (cmd === 'status') await status(arg);
  else if (cmd === 'backdate') await backdate(arg, Number(process.argv[4]));
  else if (cmd === 'set-tz') await setTz(arg);
  else if (cmd === 'cleanup') await cleanup();
  else console.log('usage: seed | status <id> | backdate <id> <minutes> | set-tz <tz> | cleanup');
}

main().finally(() => prisma.$disconnect());
