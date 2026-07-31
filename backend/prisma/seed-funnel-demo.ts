/**
 * TEMPORARY demo cohort for visualizing the onboarding funnel. All users use
 * @demo.test emails so they're trivially removable:
 *
 *   Remove:  npx ts-node prisma/seed-funnel-demo.ts --clean
 *   (or) DELETE FROM users WHERE email LIKE '%@demo.test';  -- cascades everything
 *
 * Additive only — never touches real data. Re-running replaces the demo cohort.
 */
import { PrismaClient, Role, VendorCategory, ApprovalStatus } from '@prisma/client';

const prisma = new PrismaClient();
const gen = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function clean() {
  const res = await prisma.user.deleteMany({ where: { email: { endsWith: '@demo.test' } } });
  console.log(`Removed ${res.count} demo users (@demo.test).`);
}

async function mkUser(name: string, role: Role, verified: boolean) {
  return prisma.user.create({
    data: {
      name, email: `${name.toLowerCase().replace(/\s+/g, '.')}.${gen()}@demo.test`,
      password: 'x', role, isEmailVerified: verified, referralCode: `DEMO-${gen()}`,
    },
  });
}

async function main() {
  await clean();
  if (process.argv.includes('--clean')) { await prisma.$disconnect(); return; }

  const IMG = 'https://demo.test/img.png';

  // ── Vendors across every stage ──────────────────────────────────────────────
  // [verified, hasProfile, hasDocs, approval]
  const vendorPlan: [boolean, boolean, boolean, ApprovalStatus | null][] = [
    [false, false, false, null],                    // signed up only
    [false, false, false, null],                    // signed up only
    [true, false, false, null],                     // verified, no profile
    [true, false, false, null],                     // verified, no profile
    [true, true, false, null],                      // profile, no docs
    [true, true, true, ApprovalStatus.PENDING],     // docs in, pending
    [true, true, true, ApprovalStatus.PENDING],     // docs in, pending
    [true, true, true, ApprovalStatus.APPROVED],    // fully onboarded
  ];
  let vi = 0;
  for (const [verified, hasProfile, hasDocs, approval] of vendorPlan) {
    vi += 1;
    const u = await mkUser(`Demo Vendor ${vi}`, Role.VENDOR, verified);
    const biz = `Demo Store ${vi} ${gen()}`;
    const vendor = await prisma.vendor.create({
      data: {
        userId: u.id, businessName: biz,
        slug: biz.toLowerCase().replace(/\s+/g, '-'),
        category: VendorCategory.RESTAURANT, address: '1 Demo St', city: 'Owerri',
        ...(hasProfile ? { logo: IMG, coverImage: IMG } : {}),
        ...(approval ? { approvalStatus: approval } : {}),
      },
    });
    if (hasDocs) {
      await prisma.vendorDocument.create({
        data: { vendorId: vendor.id, type: 'NIN', number: `DEMO${gen()}`, imageUrl: IMG,
          status: approval === ApprovalStatus.APPROVED ? 'VERIFIED' : 'PENDING' },
      });
    }
  }

  // ── Riders ──────────────────────────────────────────────────────────────────
  const riderPlan: [boolean, boolean, ApprovalStatus | null][] = [
    [false, false, null],                    // signed up only
    [true, false, null],                     // verified, no docs
    [true, true, ApprovalStatus.PENDING],    // docs pending
    [true, true, ApprovalStatus.APPROVED],   // approved
  ];
  let ri = 0;
  for (const [verified, hasDocs, approval] of riderPlan) {
    ri += 1;
    const u = await mkUser(`Demo Rider ${ri}`, Role.RIDER, verified);
    const rider = await prisma.rider.create({
      data: { userId: u.id, vehicleType: 'BIKE', ...(approval ? { approvalStatus: approval } : {}) },
    });
    if (hasDocs) {
      await prisma.riderDocument.create({
        data: { riderId: rider.id, ninNumber: `DEMO${gen()}`, ninImageUrl: IMG,
          status: approval === ApprovalStatus.APPROVED ? 'VERIFIED' : 'PENDING' },
      });
    }
  }

  // ── Customers (none place orders → all show as verified-but-no-order) ─────────
  const customerPlan: boolean[] = [false, true, true, true, true, true];
  let ci = 0;
  for (const verified of customerPlan) {
    ci += 1;
    const u = await mkUser(`Demo Customer ${ci}`, Role.CUSTOMER, verified);
    await prisma.customer.create({ data: { userId: u.id } });
  }

  console.log(`Seeded demo cohort: ${vendorPlan.length} vendors, ${riderPlan.length} riders, ${customerPlan.length} customers.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
