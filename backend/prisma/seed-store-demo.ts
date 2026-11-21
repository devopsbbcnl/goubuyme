/**
 * Seeds ONE demo vendor (rich menu) and ONE demo rider for App Store / Play screenshots and
 * app review. Safe to run in production: it only touches records under @storedemo.gobuyme.ng
 * and the vendor "Savour Naija Kitchen". Idempotent.
 *
 *   npm run seed:store-demo                 create (or top up) the vendor and rider
 *   npm run seed:store-demo -- --close      stop customers ordering from the demo vendor
 *   npm run seed:store-demo -- --open       let customers order from it again
 *   npm run seed:store-demo -- --remove     delete the demo vendor, rider, their orders and menu
 *
 * Flags: --yes (skip confirmation) --password=<value> (or env STORE_DEMO_PASSWORD)
 *        --reset-password (reset an existing demo account's password)
 *
 * The password is never stored in the repo. If you do not supply one, a random one is generated
 * and printed once. Ratings and verification badges are deliberately NOT faked.
 *
 * The demo customer for the same screenshots is the Play reviewer account: run
 * `npm run seed:play-reviewer` first if it does not exist yet.
 *
 * NB: `npm run demo:unseed` deletes every user containing "@demo.gobuyme." (including the Play
 * reviewer). Never run it in production. This script uses a different domain on purpose.
 */
import { PrismaClient, Role, VendorCategory, CommissionTier, ApprovalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import readline from 'readline';

const prisma = new PrismaClient();

const DOMAIN = 'storedemo.gobuyme.ng';
const VENDOR_EMAIL = `vendor@${DOMAIN}`;
const RIDER_EMAIL = `rider@${DOMAIN}`;
const BUSINESS = 'Savour Naija Kitchen';
const SLUG = 'savour-naija-kitchen';

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const MODE = has('--remove') ? 'remove' : has('--close') ? 'close' : has('--open') ? 'open' : 'seed';

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&h=650&w=940`;

type Opt = { name: string; extra?: number };
type Group = { name: string; required: boolean; items: Opt[] };
type Item = {
  name: string; description: string; price: number; category: string; photo: number;
  featured?: boolean; groups?: Group[]; drinks?: Opt[];
};

const PROTEIN: Group = {
  name: 'Choose your protein', required: true,
  items: [{ name: 'Assorted meat' }, { name: 'Goat meat', extra: 500 }, { name: 'Fish', extra: 700 }, { name: 'Chicken', extra: 400 }],
};
const SPICE: Group = {
  name: 'Spice level', required: true,
  items: [{ name: 'Mild' }, { name: 'Hot' }, { name: 'Extra hot' }],
};
const SWALLOW: Group = {
  name: 'Choose your swallow', required: true,
  items: [{ name: 'Pounded yam' }, { name: 'Eba' }, { name: 'Semovita' }, { name: 'Fufu' }, { name: 'Amala', extra: 200 }],
};
const SIDES: Group = {
  name: 'Add a side', required: false,
  items: [{ name: 'Fried plantain', extra: 600 }, { name: 'Moi moi', extra: 800 }, { name: 'Coleslaw', extra: 500 }],
};
const DRINKS: Opt[] = [{ name: 'Chilled Zobo', extra: 800 }, { name: 'Soft drink (can)', extra: 500 }, { name: 'Bottled water', extra: 300 }];

const MENU: Item[] = [
  // Rice and party favourites
  { name: 'Party Jollof + Smoky Chicken', description: 'Firewood-style party jollof with a grilled chicken thigh and sweet fried plantain.', price: 3800, category: 'Rice & Party Favourites', photo: 13915043, featured: true, groups: [SIDES], drinks: DRINKS },
  { name: 'Party Jollof (Large Party Tray)', description: 'Generous tray of smoky party jollof, serves 4 to 5 people.', price: 12500, category: 'Rice & Party Favourites', photo: 8166269 },
  { name: 'Special Fried Rice + Dodo', description: 'Veggie-loaded fried rice with prawns, served with golden fried plantain.', price: 3900, category: 'Rice & Party Favourites', photo: 27556972, featured: true, groups: [SIDES], drinks: DRINKS },
  { name: 'White Rice + Native Stew', description: 'Soft white rice with rich, slow-cooked tomato and pepper stew.', price: 2800, category: 'Rice & Party Favourites', photo: 19781592, groups: [PROTEIN], drinks: DRINKS },
  // Soups and swallow
  { name: 'Egusi Soup + Swallow', description: 'Rich melon seed soup with assorted meat, stockfish and ugwu leaf.', price: 4200, category: 'Soups & Swallow', photo: 31820028, featured: true, groups: [SWALLOW, PROTEIN] },
  { name: 'Edikang Ikong + Swallow', description: 'Calabar-style vegetable soup packed with waterleaf, ugwu, periwinkle and fish.', price: 4600, category: 'Soups & Swallow', photo: 13994299, featured: true, groups: [SWALLOW] },
  { name: 'Banga Soup + Starch', description: 'Delta-style palm nut soup with fresh catfish and native starch.', price: 4800, category: 'Soups & Swallow', photo: 37663504 },
  { name: 'Oha Soup + Fufu', description: 'Oha leaves simmered with cocoyam, assorted meat and stockfish.', price: 4200, category: 'Soups & Swallow', photo: 633627, groups: [PROTEIN] },
  { name: 'Afang Soup + Semovita', description: 'Afang and waterleaf soup with periwinkle, snail and smoked fish.', price: 4500, category: 'Soups & Swallow', photo: 9638804 },
  { name: 'Tuwo Shinkafa + Miyan Kuka', description: 'Soft rice tuwo with northern baobab-leaf soup.', price: 3500, category: 'Soups & Swallow', photo: 37648014 },
  // Grills and suya
  { name: 'Suya Platter (5 sticks)', description: 'Thin-sliced beef suya rubbed in yaji, with onions, tomatoes and cabbage.', price: 3200, category: 'Grills & Suya', photo: 23614250, featured: true, groups: [SPICE] },
  { name: 'Charcoal Grilled Chicken (Half)', description: 'Half chicken marinated overnight and grilled over charcoal.', price: 5800, category: 'Grills & Suya', photo: 27777833, featured: true, groups: [SPICE, SIDES], drinks: DRINKS },
  { name: 'Asun (Spicy Goat Meat)', description: 'Peppery grilled goat meat tossed with onions and scotch bonnet.', price: 5200, category: 'Grills & Suya', photo: 34772931, groups: [SPICE] },
  { name: 'Masa + Suya', description: 'Warm northern rice cakes with a side of suya.', price: 2600, category: 'Grills & Suya', photo: 28160385 },
  // Shawarma
  { name: 'Chicken Shawarma Roll', description: 'Grilled chicken, sausage, cabbage and creamy garlic sauce in a toasted wrap.', price: 3000, category: 'Shawarma & Wraps', photo: 5779372, drinks: DRINKS },
  { name: 'Beef Shawarma Roll', description: 'Spiced beef strips with fresh veg and our house sauce.', price: 3300, category: 'Shawarma & Wraps', photo: 11286814, drinks: DRINKS },
  // Snacks and sides
  { name: 'Puff Puff (6 pieces)', description: 'Fluffy, golden and lightly sweet.', price: 1200, category: 'Snacks & Sides', photo: 34521022 },
  { name: 'Moi Moi + Pap', description: 'Steamed bean pudding with smooth pap, a classic breakfast.', price: 1800, category: 'Snacks & Sides', photo: 31615010 },
  { name: 'Fried Plantain (Dodo)', description: 'Ripe plantain fried until caramelised at the edges.', price: 1000, category: 'Snacks & Sides', photo: 36886535 },
  { name: 'Abacha (African Salad)', description: 'Shredded cassava with ugba, crayfish, garden eggs and utazi.', price: 3200, category: 'Snacks & Sides', photo: 31606085 },
  { name: 'Kilishi (100 g)', description: 'Dried, spiced beef jerky from the north.', price: 2500, category: 'Snacks & Sides', photo: 34143556 },
  // Specials
  { name: 'Catfish Pepper Soup', description: 'Fresh point-and-kill catfish in a hot, aromatic broth with utazi.', price: 5800, category: "Chef's Specials", photo: 20943923, featured: true },
  { name: 'Goat Meat Pepper Soup', description: 'Tender goat meat in a warming peppery broth.', price: 4800, category: "Chef's Specials", photo: 37648018 },
  // Drinks
  { name: 'Chilled Zobo (Large)', description: 'Hibiscus with ginger and pineapple, served cold.', price: 800, category: 'Drinks', photo: 4113660 },
  { name: 'Chapman', description: 'Our fruity, fizzy house Chapman with cucumber and orange.', price: 1500, category: 'Drinks', photo: 28273313 },
  { name: 'Soft Drink (Can)', description: 'Coke, Fanta or Sprite.', price: 500, category: 'Drinks', photo: 4113653 },
];

function dbHost(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
function confirm(q: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim().toLowerCase() === 'yes'); }));
}

async function setOpen(open: boolean) {
  const v = await prisma.vendor.findUnique({ where: { slug: SLUG } });
  if (!v) throw new Error('Demo vendor does not exist. Run the seed first.');
  await prisma.vendor.update({
    where: { id: v.id },
    data: { availabilityOverride: open ? 'FORCE_OPEN' : 'FORCE_CLOSED', isOpen: open },
  });
  console.log(open
    ? '✓ Demo vendor is OPEN: customers can order from it.'
    : '✓ Demo vendor is CLOSED: customers cannot order from it (it is still visible).');
}

async function remove() {
  const users = await prisma.user.findMany({
    where: { email: { in: [VENDOR_EMAIL, RIDER_EMAIL] } },
    include: { vendor: true, rider: true },
  });
  const vendorIds = users.flatMap((u) => (u.vendor ? [u.vendor.id] : []));
  const riderIds = users.flatMap((u) => (u.rider ? [u.rider.id] : []));
  const orders = await prisma.order.findMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { riderId: { in: riderIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length) {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.earning.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.vendorPayout.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.vendorIncident.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.conversation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (vendorIds.length) {
    await prisma.vendorIncident.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.cartItem.deleteMany({ where: { menuItem: { vendorId: { in: vendorIds } } } });
    await prisma.cart.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.favorite.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.menuItem.deleteMany({ where: { vendorId: { in: vendorIds } } });
    await prisma.vendorPromotion.deleteMany({ where: { vendorId: { in: vendorIds } } });
  }
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  console.log(`✓ Removed ${users.length} demo account(s), ${vendorIds.length} vendor(s), ${orderIds.length} order(s).`);
}

async function seed() {
  const suppliedPassword = arg('password') ?? process.env.STORE_DEMO_PASSWORD;
  const password = suppliedPassword ?? crypto.randomBytes(9).toString('base64url') + '#1a';
  const hash = await bcrypt.hash(password, 12);
  const resetPassword = has('--reset-password');
  let printPassword = false;

  // ── Vendor ────────────────────────────────────────────────────────────────
  let vUser = await prisma.user.findUnique({ where: { email: VENDOR_EMAIL }, include: { vendor: true } });
  if (vUser && vUser.role !== Role.VENDOR) throw new Error(`${VENDOR_EMAIL} exists with role ${vUser.role}; refusing.`);
  if (!vUser) {
    vUser = await prisma.user.create({
      data: {
        name: 'Ngozi Adeyemi', email: VENDOR_EMAIL, password: hash, role: Role.VENDOR,
        isEmailVerified: true, isActive: true, referralCode: 'STOREDEMO-VENDOR',
      },
      include: { vendor: true },
    });
    printPassword = true;
  } else if (resetPassword) {
    await prisma.user.update({ where: { id: vUser.id }, data: { password: hash } });
    printPassword = true;
  }

  let vendor = vUser.vendor ?? (await prisma.vendor.findUnique({ where: { slug: SLUG } }));
  if (!vendor) {
    const clash = await prisma.vendor.findUnique({ where: { businessName: BUSINESS } });
    if (clash) throw new Error(`A vendor named "${BUSINESS}" already exists and is not the demo vendor.`);
    vendor = await prisma.vendor.create({
      data: {
        userId: vUser.id,
        businessName: BUSINESS,
        slug: SLUG,
        description: 'Proper Nigerian home cooking, from smoky party jollof to rich soups, charcoal grills and cold zobo. Cooked fresh to order in Port Harcourt.',
        logo: px(13915043),
        coverImage: px(37648014),
        category: VendorCategory.RESTAURANT,
        subcategory: 'Nigerian Kitchen',
        address: '14 Tombia Street, GRA Phase 2',
        city: 'Port Harcourt',
        state: 'Rivers',
        latitude: 4.8032,
        longitude: 7.0095,
        isOpen: true,
        availabilityOverride: 'FORCE_OPEN',
        approvalStatus: ApprovalStatus.APPROVED,
        commissionTier: CommissionTier.TIER_2,
        openingTime: '08:00',
        closingTime: '22:00',
        avgDeliveryTime: 35,
        isFeatured: true,
        featuredUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        displayOrder: 1,
      },
    });
    await prisma.vendorBusinessHours.createMany({
      data: Array.from({ length: 7 }, (_, d) => ({ vendorId: vendor!.id, dayOfWeek: d, openTime: '08:00', closeTime: '22:00' })),
    });
    console.log(`✓ Vendor created: ${BUSINESS}`);
  } else {
    console.log(`• Vendor already exists: ${vendor.businessName}`);
  }

  // Menu: add only missing items by name, so re-running never duplicates or overwrites edits.
  const have = new Set((await prisma.menuItem.findMany({ where: { vendorId: vendor.id }, select: { name: true } })).map((m) => m.name));
  let added = 0;
  for (const it of MENU) {
    if (have.has(it.name)) continue;
    await prisma.menuItem.create({
      data: {
        vendorId: vendor.id, name: it.name, description: it.description, price: it.price,
        image: px(it.photo), category: it.category, isFeatured: !!it.featured, stockQuantity: 999,
        optionGroups: it.groups
          ? { create: it.groups.map((g) => ({ name: g.name, required: g.required, items: { create: g.items.map((o) => ({ name: o.name, extraPrice: o.extra ?? 0 })) } })) }
          : undefined,
        drinkOptions: it.drinks ? { create: it.drinks.map((d) => ({ name: d.name, price: d.extra ?? 0 })) } : undefined,
      },
    });
    added++;
  }
  console.log(`✓ Menu: ${added} item(s) added, ${MENU.length - added} already there.`);

  const promoCount = await prisma.vendorPromotion.count({ where: { vendorId: vendor.id } });
  if (!promoCount) {
    await prisma.vendorPromotion.create({
      data: {
        vendorId: vendor.id, title: 'Free Puff Puff with any soup order', imageUrl: px(34521022),
        code: 'PUFFPUFF', isActive: true, approvalStatus: 'APPROVED', reviewedAt: new Date(),
      },
    });
    console.log('✓ Promo card created (approved). It shows on the home carousel only while the vendor is a TIER_2 and approved.');
  }

  // ── Rider ─────────────────────────────────────────────────────────────────
  let rUser = await prisma.user.findUnique({ where: { email: RIDER_EMAIL }, include: { rider: true } });
  if (rUser && rUser.role !== Role.RIDER) throw new Error(`${RIDER_EMAIL} exists with role ${rUser.role}; refusing.`);
  if (!rUser) {
    rUser = await prisma.user.create({
      data: {
        name: 'Ifeanyi Nwosu', email: RIDER_EMAIL, password: hash, role: Role.RIDER,
        isEmailVerified: true, isActive: true, referralCode: 'STOREDEMO-RIDER',
        rider: {
          create: {
            vehicleType: 'Motorcycle', plateNumber: 'RSH-481-KD', isAvailable: true, isOnline: true,
            latitude: 4.8051, longitude: 7.0118, approvalStatus: ApprovalStatus.APPROVED,
            city: 'Port Harcourt', state: 'Rivers',
          },
        },
      },
      include: { rider: true },
    });
    printPassword = true;
    console.log('✓ Rider created: Ifeanyi Nwosu');
  } else {
    if (resetPassword) {
      await prisma.user.update({ where: { id: rUser.id }, data: { password: hash } });
      printPassword = true;
    }
    console.log('• Rider already exists.');
  }

  console.log('\nLogins');
  console.log(`  Vendor: ${VENDOR_EMAIL}`);
  console.log(`  Rider:  ${RIDER_EMAIL}`);
  if (printPassword) console.log(`  Password: ${password}${suppliedPassword ? '' : '   (generated: shown once, save it now)'}`);
  else console.log('  Password: unchanged (use --reset-password to set a new one)');
  console.log('\nBoth accounts are approved with email verified. Use the Play reviewer customer for orders.');
}

async function main() {
  console.log(`Target database: ${dbHost()}`);
  console.log(`Mode: ${MODE}\n`);
  if (!has('--yes') && !(await confirm('Type "yes" to continue: '))) {
    console.log('Aborted.');
    return;
  }
  if (MODE === 'remove') return remove();
  if (MODE === 'close') return setOpen(false);
  if (MODE === 'open') return setOpen(true);
  return seed();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
