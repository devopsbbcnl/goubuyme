/**
 * Demo seed — creates realistic Nigerian market data for app screenshots.
 * All demo users share the email domain @demo.gobuyme.test.
 * Run:   npm run demo:seed
 * Wipe:  npm run demo:unseed
 *
 * Password for every demo account: Demo@2026!
 */
import {
  PrismaClient,
  Role,
  VendorCategory,
  CommissionTier,
  ApprovalStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PayoutStatus,
  DocumentType,
  DocumentStatus,
  VerificationBadge,
  LicenseType,
  LicenseStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
export const DEMO_DOMAIN = 'demo.gobuyme.ng';

async function seedDemo() {
  console.log('🌱 Seeding demo data for GoBuyMe...\n');

  const existing = await prisma.user.findFirst({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
  });
  if (existing) {
    console.log('⚠️  Demo data already exists. Run `npm run demo:unseed` first.');
    return;
  }

  const password = await bcrypt.hash('Demo@2026!', 12);

  // ─── CUSTOMER ─────────────────────────────────────────────────────────────

  const customerUser = await prisma.user.create({
    data: {
      name: 'Adaeze Okafor',
      email: `adaeze@${DEMO_DOMAIN}`,
      phone: '+2348031234567',
      password,
      role: Role.CUSTOMER,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-ADAEZE',
      avatar: 'https://picsum.photos/seed/adaeze/200/200',
      freeDeliveryCredits: 2,
      customer: {
        create: {
          addresses: {
            createMany: {
              data: [
                {
                  label: 'Home',
                  address: '15 Rumuola Road',
                  city: 'Port Harcourt',
                  state: 'Rivers',
                  latitude: 4.8241,
                  longitude: 7.0483,
                  isDefault: true,
                },
                {
                  label: 'Office',
                  address: '3 Aba Road, GRA',
                  city: 'Port Harcourt',
                  state: 'Rivers',
                  latitude: 4.8065,
                  longitude: 7.0152,
                  isDefault: false,
                },
              ],
            },
          },
        },
      },
    },
    include: { customer: true },
  });
  const customer = customerUser.customer!;
  console.log(`✓ Customer created: ${customerUser.email}`);

  // ─── VENDOR 1 — Mama Chika's Kitchen (Restaurant, TIER_2, Business Verified) ─

  const vendor1User = await prisma.user.create({
    data: {
      name: "Chika Eze",
      email: `mamachika@${DEMO_DOMAIN}`,
      phone: '+2348051112233',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-MAMACHIKA',
    },
  });

  const vendor1 = await prisma.vendor.create({
    data: {
      userId: vendor1User.id,
      businessName: "Mama Chika's Kitchen",
      slug: 'mama-chikas-kitchen',
      description:
        'Authentic Nigerian home cooking. From smoky party jollof to rich Banga soup — we bring the taste of home straight to your door.',
      logo: 'https://picsum.photos/seed/mamachika-logo/200/200',
      coverImage: 'https://picsum.photos/seed/mamachika-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '22 Trans Amadi Road',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.8156,
      longitude: 7.0498,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '08:00',
      closingTime: '21:00',
      rating: 4.7,
      totalRatings: 142,
      avgDeliveryTime: 35,
      verificationBadge: VerificationBadge.BUSINESS_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: vendor1.id, name: 'Jollof Rice + Chicken', description: 'Party jollof with smoky oven chicken', price: 2500, image: 'https://picsum.photos/seed/jollof/400/300', category: 'Rice Dishes', isFeatured: true },
      { vendorId: vendor1.id, name: 'Egusi Soup + Pounded Yam', description: 'Fresh egusi with assorted meat and stockfish', price: 3200, image: 'https://picsum.photos/seed/egusi/400/300', category: 'Soups & Swallow' },
      { vendorId: vendor1.id, name: 'Banga Soup + Starch', description: 'Delta-style palm nut soup with wrap', price: 3500, image: 'https://picsum.photos/seed/banga/400/300', category: 'Soups & Swallow' },
      { vendorId: vendor1.id, name: 'Fried Rice + Plantain', description: 'Special fried rice with golden dodo', price: 2800, image: 'https://picsum.photos/seed/friedrice/400/300', category: 'Rice Dishes', isFeatured: true },
      { vendorId: vendor1.id, name: 'Catfish Pepper Soup', description: 'Spicy point-and-kill style with utazi', price: 4500, image: 'https://picsum.photos/seed/peppersoup/400/300', category: 'Specials' },
      { vendorId: vendor1.id, name: 'Moi Moi + Ogi', description: 'Traditional breakfast combo', price: 1200, image: 'https://picsum.photos/seed/moimoi/400/300', category: 'Breakfast' },
      { vendorId: vendor1.id, name: 'Oha Soup + Fufu', description: 'Oha leaves simmered with assorted meat', price: 3000, image: 'https://picsum.photos/seed/ohasoup/400/300', category: 'Soups & Swallow' },
      { vendorId: vendor1.id, name: 'Zobo Drink (Large)', description: 'Chilled hibiscus with ginger and pineapple', price: 600, image: 'https://picsum.photos/seed/zobo/400/300', category: 'Drinks' },
      { vendorId: vendor1.id, name: 'Chapman Cocktail', description: 'Classic Nigerian party mocktail', price: 800, image: 'https://picsum.photos/seed/chapman/400/300', category: 'Drinks' },
    ],
  });

  await prisma.vendorDocument.create({
    data: {
      vendorId: vendor1.id,
      type: DocumentType.NIN,
      number: '12345678901',
      imageUrl: 'https://picsum.photos/seed/nin-doc1/400/300',
      bvn: '12345678901',
      selfieUrl: 'https://picsum.photos/seed/selfie1/400/300',
      status: DocumentStatus.VERIFIED,
    },
  });

  await prisma.vendorBusinessVerification.create({
    data: {
      vendorId: vendor1.id,
      cacNumber: 'RC-1234567',
      cacImageUrl: 'https://picsum.photos/seed/cac-doc1/400/300',
      tin: '1234567-0001',
      directorNin: '12345678901',
      status: DocumentStatus.VERIFIED,
    },
  });

  await prisma.vendorPromotion.create({
    data: {
      vendorId: vendor1.id,
      title: '20% Off All Rice Dishes Today!',
      imageUrl: 'https://picsum.photos/seed/promo-mamachika/1080/580',
      code: 'RICE20',
      isActive: true,
    },
  });

  console.log(`✓ Vendor 1 created: ${vendor1User.email} (Restaurant)`);

  // ─── VENDOR 2 — QuickMart Groceries (Grocery, TIER_1, ID Verified) ─────────

  const vendor2User = await prisma.user.create({
    data: {
      name: 'Emeka Obi',
      email: `quickmart@${DEMO_DOMAIN}`,
      phone: '+2348062223344',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-QUICKMART',
    },
  });

  const vendor2 = await prisma.vendor.create({
    data: {
      userId: vendor2User.id,
      businessName: 'QuickMart Groceries',
      slug: 'quickmart-groceries',
      description: 'Fresh groceries, household essentials, and more — delivered to your door in under 40 minutes.',
      logo: 'https://picsum.photos/seed/quickmart-logo/200/200',
      coverImage: 'https://picsum.photos/seed/quickmart-cover/1080/580',
      category: VendorCategory.GROCERY,
      address: '5 Rumuola Road',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.827,
      longitude: 7.0411,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '07:00',
      closingTime: '22:00',
      rating: 4.3,
      totalRatings: 87,
      avgDeliveryTime: 28,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: vendor2.id, name: 'Tomatoes (1 kg)', price: 800, image: 'https://picsum.photos/seed/tomatoes/400/300', category: 'Vegetables & Fruits' },
      { vendorId: vendor2.id, name: 'Indomie Noodles (Pack of 10)', price: 2200, image: 'https://picsum.photos/seed/indomie/400/300', category: 'Dry Goods', isFeatured: true },
      { vendorId: vendor2.id, name: 'Hollandia Yoghurt (1 L)', price: 1800, image: 'https://picsum.photos/seed/yoghurt/400/300', category: 'Dairy' },
      { vendorId: vendor2.id, name: 'Golden Morn (500 g)', price: 1400, image: 'https://picsum.photos/seed/goldenmorn/400/300', category: 'Cereals' },
      { vendorId: vendor2.id, name: 'Canola Cooking Oil (1 L)', price: 2600, image: 'https://picsum.photos/seed/cookingoil/400/300', category: 'Cooking Essentials' },
      { vendorId: vendor2.id, name: 'Dangote Sugar (1 kg)', price: 1200, image: 'https://picsum.photos/seed/sugar/400/300', category: 'Cooking Essentials' },
      { vendorId: vendor2.id, name: 'Frozen Chicken (1 kg)', price: 4500, image: 'https://picsum.photos/seed/chicken/400/300', category: 'Meat & Fish', isFeatured: true },
      { vendorId: vendor2.id, name: 'Peak Milk Powder (400 g)', price: 2100, image: 'https://picsum.photos/seed/peakmilk/400/300', category: 'Dairy' },
    ],
  });

  await prisma.vendorDocument.create({
    data: {
      vendorId: vendor2.id,
      type: DocumentType.DRIVERS_LICENSE,
      number: 'DL-9876543',
      imageUrl: 'https://picsum.photos/seed/dl-doc2/400/300',
      status: DocumentStatus.VERIFIED,
    },
  });

  console.log(`✓ Vendor 2 created: ${vendor2User.email} (Grocery)`);

  // ─── VENDOR 3 — HealthPlus Pharmacy (Pharmacy, TIER_2, Premium Verified) ───

  const vendor3User = await prisma.user.create({
    data: {
      name: 'Dr. Ngozi Adeleke',
      email: `healthplus@${DEMO_DOMAIN}`,
      phone: '+2348073334455',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-HEALTHPLUS',
    },
  });

  const vendor3 = await prisma.vendor.create({
    data: {
      userId: vendor3User.id,
      businessName: 'HealthPlus Pharmacy',
      slug: 'healthplus-pharmacy',
      description: 'PCN-licensed pharmacy delivering genuine medications and health products across Port Harcourt.',
      logo: 'https://picsum.photos/seed/healthplus-logo/200/200',
      coverImage: 'https://picsum.photos/seed/healthplus-cover/1080/580',
      category: VendorCategory.PHARMACY,
      address: '12 Peter Odili Road',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.819,
      longitude: 7.035,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '08:00',
      closingTime: '20:00',
      rating: 4.9,
      totalRatings: 56,
      avgDeliveryTime: 25,
      verificationBadge: VerificationBadge.PREMIUM_VERIFIED,
      isPharmacyFlagged: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: vendor3.id, name: 'Paracetamol (Strip)', price: 200, image: 'https://picsum.photos/seed/paracetamol/400/300', category: 'Pain Relief', isFeatured: true },
      { vendorId: vendor3.id, name: 'Vitamin C 1000 mg (30 tablets)', price: 1800, image: 'https://picsum.photos/seed/vitaminc/400/300', category: 'Vitamins' },
      { vendorId: vendor3.id, name: 'Oral Rehydration Salts (ORS)', price: 350, image: 'https://picsum.photos/seed/ors/400/300', category: 'Essentials' },
      { vendorId: vendor3.id, name: 'Blood Pressure Monitor', price: 25000, image: 'https://picsum.photos/seed/bpmonitor/400/300', category: 'Devices' },
      { vendorId: vendor3.id, name: 'Hand Sanitizer (500 ml)', price: 1500, image: 'https://picsum.photos/seed/sanitizer/400/300', category: 'Hygiene' },
      { vendorId: vendor3.id, name: 'Malaria Rapid Test Kit', price: 2500, image: 'https://picsum.photos/seed/malariakit/400/300', category: 'Test Kits', isFeatured: true },
    ],
  });

  await prisma.vendorDocument.create({
    data: {
      vendorId: vendor3.id,
      type: DocumentType.NIN,
      number: '98765432100',
      imageUrl: 'https://picsum.photos/seed/nin-doc3/400/300',
      bvn: '98765432100',
      selfieUrl: 'https://picsum.photos/seed/selfie3/400/300',
      status: DocumentStatus.VERIFIED,
    },
  });

  await prisma.vendorBusinessVerification.create({
    data: {
      vendorId: vendor3.id,
      cacNumber: 'RC-9876543',
      cacImageUrl: 'https://picsum.photos/seed/cac-doc3/400/300',
      tin: '9876543-0001',
      directorNin: '98765432100',
      status: DocumentStatus.VERIFIED,
    },
  });

  await prisma.vendorLicense.create({
    data: {
      vendorId: vendor3.id,
      type: LicenseType.PHARMACIST,
      licenseNumber: 'PCN-2024-001234',
      imageUrl: 'https://picsum.photos/seed/pharmacist-lic/400/300',
      expiresAt: new Date('2027-12-31'),
      status: LicenseStatus.VERIFIED,
    },
  });

  console.log(`✓ Vendor 3 created: ${vendor3User.email} (Pharmacy)`);

  // ─── VENDOR 4 — GoFetch Errands (Errand, TIER_1, Unverified) ──────────────

  const vendor4User = await prisma.user.create({
    data: {
      name: 'Bayo Adeleke',
      email: `gofetch@${DEMO_DOMAIN}`,
      phone: '+2348084445566',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-GOFETCH',
    },
  });

  const vendor4 = await prisma.vendor.create({
    data: {
      userId: vendor4User.id,
      businessName: 'GoFetch Errands',
      slug: 'gofetch-errands',
      description: 'We run your errands — pick up packages, documents, or anything you need moved across town fast.',
      logo: 'https://picsum.photos/seed/gofetch-logo/200/200',
      coverImage: 'https://picsum.photos/seed/gofetch-cover/1080/580',
      category: VendorCategory.ERRAND,
      address: '7 Aggrey Road, Mile 1',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.81,
      longitude: 7.058,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '07:30',
      closingTime: '20:00',
      rating: 4.5,
      totalRatings: 33,
      avgDeliveryTime: 45,
      verificationBadge: VerificationBadge.UNVERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: vendor4.id, name: 'Document Pickup & Delivery', description: 'Collect and deliver documents anywhere in PH', price: 1500, image: 'https://picsum.photos/seed/errand-doc/400/300', category: 'Documents', isFeatured: true },
      { vendorId: vendor4.id, name: 'Small Package (up to 5 kg)', description: 'Pickup and drop-off of lightweight parcels', price: 1800, image: 'https://picsum.photos/seed/errand-pkg/400/300', category: 'Packages' },
      { vendorId: vendor4.id, name: 'Large Package (5–20 kg)', description: 'Heavier items, secure handling guaranteed', price: 3500, image: 'https://picsum.photos/seed/errand-large/400/300', category: 'Packages' },
      { vendorId: vendor4.id, name: 'Supermarket Run', description: 'We shop on your behalf with your list', price: 2000, image: 'https://picsum.photos/seed/supermarket/400/300', category: 'Shopping', isFeatured: true },
    ],
  });

  console.log(`✓ Vendor 4 created: ${vendor4User.email} (Errand)`);

  // ─── RIDER 1 — Emeka Eze (Motorcycle, Online & Available) ─────────────────

  const rider1User = await prisma.user.create({
    data: {
      name: 'Emeka Eze',
      email: `emeka.rider@${DEMO_DOMAIN}`,
      phone: '+2348091112233',
      password,
      role: Role.RIDER,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-EMEKA-RIDER',
      avatar: 'https://picsum.photos/seed/emeka-rider/200/200',
    },
  });

  const rider1 = await prisma.rider.create({
    data: {
      userId: rider1User.id,
      vehicleType: 'Motorcycle',
      plateNumber: 'RSH-234-AB',
      isAvailable: true,
      isOnline: true,
      latitude: 4.818,
      longitude: 7.046,
      approvalStatus: ApprovalStatus.APPROVED,
      rating: 4.8,
      totalRatings: 94,
    },
  });

  await prisma.riderDocument.create({
    data: {
      riderId: rider1.id,
      ninNumber: '55544433322',
      ninImageUrl: 'https://picsum.photos/seed/rider1-nin/400/300',
      selfieUrl: 'https://picsum.photos/seed/rider1-selfie/400/300',
      vehicleImageUrl: 'https://picsum.photos/seed/rider1-vehicle/400/300',
      guarantorName: 'Chukwu Emenike',
      guarantorPhone: '+2348022233344',
      guarantorAddress: '4 Woji Road, Port Harcourt',
      status: DocumentStatus.VERIFIED,
    },
  });

  console.log(`✓ Rider 1 created: ${rider1User.email} (Online)`);

  // ─── RIDER 2 — Tunde Bakare (Bicycle, Offline) ────────────────────────────

  const rider2User = await prisma.user.create({
    data: {
      name: 'Tunde Bakare',
      email: `tunde.rider@${DEMO_DOMAIN}`,
      phone: '+2348096667788',
      password,
      role: Role.RIDER,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-TUNDE-RIDER',
      avatar: 'https://picsum.photos/seed/tunde-rider/200/200',
    },
  });

  const rider2 = await prisma.rider.create({
    data: {
      userId: rider2User.id,
      vehicleType: 'Bicycle',
      plateNumber: null,
      isAvailable: false,
      isOnline: false,
      latitude: 4.83,
      longitude: 7.053,
      approvalStatus: ApprovalStatus.APPROVED,
      rating: 4.5,
      totalRatings: 38,
    },
  });

  await prisma.riderDocument.create({
    data: {
      riderId: rider2.id,
      ninNumber: '66677788899',
      ninImageUrl: 'https://picsum.photos/seed/rider2-nin/400/300',
      selfieUrl: 'https://picsum.photos/seed/rider2-selfie/400/300',
      guarantorName: 'Rasheed Alabi',
      guarantorPhone: '+2348033344455',
      guarantorAddress: '10 Eleme Road, Port Harcourt',
      status: DocumentStatus.VERIFIED,
    },
  });

  console.log(`✓ Rider 2 created: ${rider2User.email} (Offline)`);

  // ─── ORDERS ───────────────────────────────────────────────────────────────

  const jollof = await prisma.menuItem.findFirst({ where: { vendorId: vendor1.id, name: { contains: 'Jollof' } } });
  const egusi  = await prisma.menuItem.findFirst({ where: { vendorId: vendor1.id, name: { contains: 'Egusi' } } });
  const friedR = await prisma.menuItem.findFirst({ where: { vendorId: vendor1.id, name: { contains: 'Fried Rice' } } });
  const banga  = await prisma.menuItem.findFirst({ where: { vendorId: vendor1.id, name: { contains: 'Banga' } } });
  const indomie = await prisma.menuItem.findFirst({ where: { vendorId: vendor2.id, name: { contains: 'Indomie' } } });
  const frozenChicken = await prisma.menuItem.findFirst({ where: { vendorId: vendor2.id, name: { contains: 'Frozen Chicken' } } });
  const para   = await prisma.menuItem.findFirst({ where: { vendorId: vendor3.id, name: { contains: 'Paracetamol' } } });
  const vitC   = await prisma.menuItem.findFirst({ where: { vendorId: vendor3.id, name: { contains: 'Vitamin C' } } });

  // Order 1: DELIVERED — Mama Chika's, rated 5★, 2 days ago
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-240001',
      customerId: customer.id,
      vendorId: vendor1.id,
      riderId: rider1.id,
      status: OrderStatus.DELIVERED,
      subtotal: 5700,
      deliveryFee: 700,
      originalDeliveryFee: 700,
      platformFee: 427.5,
      totalAmount: 6400,
      deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241,
      deliveryLongitude: 7.0483,
      distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_demo_ref_001',
      paystackVerified: true,
      rating: 5,
      review: 'Amazing food! The jollof was smoky and perfect. Very fast delivery.',
      estimatedTime: 35,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          { menuItemId: jollof!.id, name: jollof!.name, price: jollof!.price, quantity: 2 },
          { menuItemId: egusi!.id,  name: egusi!.name,  price: egusi!.price,  quantity: 1 },
        ],
      },
    },
  });

  await prisma.earning.create({
    data: { riderId: rider1.id, orderId: order1.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED },
  });
  await prisma.vendorPayout.create({
    data: { vendorId: vendor1.id, orderId: order1.id, subtotal: 5700, platformFee: 427.5, netAmount: 5272.5, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED },
  });

  // Order 2: IN_TRANSIT — QuickMart, rider assigned
  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-240002',
      customerId: customer.id,
      vendorId: vendor2.id,
      riderId: rider1.id,
      status: OrderStatus.IN_TRANSIT,
      subtotal: 6700,
      deliveryFee: 800,
      originalDeliveryFee: 800,
      platformFee: 201,
      totalAmount: 7500,
      deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241,
      deliveryLongitude: 7.0483,
      distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_demo_ref_002',
      paystackVerified: true,
      estimatedTime: 28,
      items: {
        create: [
          { menuItemId: indomie!.id,       name: indomie!.name,       price: indomie!.price,       quantity: 1 },
          { menuItemId: frozenChicken!.id, name: frozenChicken!.name, price: frozenChicken!.price, quantity: 1 },
        ],
      },
    },
  });

  // Order 3: PREPARING — Mama Chika's, no rider yet
  const order3 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-240003',
      customerId: customer.id,
      vendorId: vendor1.id,
      status: OrderStatus.PREPARING,
      subtotal: 2800,
      deliveryFee: 600,
      originalDeliveryFee: 600,
      platformFee: 210,
      totalAmount: 3400,
      deliveryAddress: '3 Aba Road, GRA, Port Harcourt',
      deliveryLatitude: 4.8065,
      deliveryLongitude: 7.0152,
      distanceKm: 1.8,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_demo_ref_003',
      paystackVerified: true,
      estimatedTime: 35,
      items: {
        create: [
          { menuItemId: friedR!.id, name: friedR!.name, price: friedR!.price, quantity: 1 },
        ],
      },
    },
  });

  // Order 4: CONFIRMED — Mama Chika's (just confirmed, waiting on rider)
  const order4 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-240004',
      customerId: customer.id,
      vendorId: vendor1.id,
      status: OrderStatus.CONFIRMED,
      subtotal: 3500,
      deliveryFee: 650,
      originalDeliveryFee: 650,
      platformFee: 262.5,
      totalAmount: 4150,
      deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241,
      deliveryLongitude: 7.0483,
      distanceKm: 2.0,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_demo_ref_004',
      paystackVerified: true,
      estimatedTime: 35,
      items: {
        create: [
          { menuItemId: banga!.id, name: banga!.name, price: banga!.price, quantity: 1 },
        ],
      },
    },
  });

  // Order 5: PENDING — HealthPlus, cash on delivery
  const order5 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-240005',
      customerId: customer.id,
      vendorId: vendor3.id,
      status: OrderStatus.PENDING,
      subtotal: 2000,
      deliveryFee: 500,
      originalDeliveryFee: 500,
      platformFee: 150,
      totalAmount: 2500,
      deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241,
      deliveryLongitude: 7.0483,
      distanceKm: 1.2,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      paymentStatus: PaymentStatus.PENDING,
      estimatedTime: 25,
      items: {
        create: [
          { menuItemId: para!.id, name: para!.name, price: para!.price, quantity: 2 },
          { menuItemId: vitC!.id, name: vitC!.name, price: vitC!.price, quantity: 1 },
        ],
      },
    },
  });

  // Order 6: CANCELLED — QuickMart, 5 days ago
  const order6 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-239999',
      customerId: customer.id,
      vendorId: vendor2.id,
      status: OrderStatus.CANCELLED,
      subtotal: 2200,
      deliveryFee: 600,
      originalDeliveryFee: 600,
      platformFee: 66,
      totalAmount: 2800,
      deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241,
      deliveryLongitude: 7.0483,
      distanceKm: 2.0,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.REFUNDED,
      paystackRef: 'ps_demo_ref_006',
      paystackVerified: true,
      cancelReason: 'Changed my mind',
      estimatedTime: 30,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          { menuItemId: indomie!.id, name: indomie!.name, price: indomie!.price, quantity: 1 },
        ],
      },
    },
  });

  console.log('✓ 6 orders created (DELIVERED, IN_TRANSIT, PREPARING, CONFIRMED, PENDING, CANCELLED)');

  // ─── FAVORITES ────────────────────────────────────────────────────────────

  await prisma.favorite.createMany({
    data: [
      { customerId: customer.id, vendorId: vendor1.id },
      { customerId: customer.id, vendorId: vendor3.id },
    ],
  });

  // ─── CART ─────────────────────────────────────────────────────────────────

  const cart = await prisma.cart.create({ data: { customerId: customer.id, vendorId: vendor1.id } });
  await prisma.cartItem.createMany({
    data: [
      { cartId: cart.id, menuItemId: jollof!.id, quantity: 2 },
      { cartId: cart.id, menuItemId: egusi!.id,  quantity: 1, note: 'Extra stockfish please' },
    ],
  });

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

  await prisma.notification.createMany({
    data: [
      // Customer
      { userId: customerUser.id, title: 'Order on its way! 🛵', body: 'Emeka is heading to you with your QuickMart order. ETA: 12 minutes.', type: 'ORDER_UPDATE', isRead: false, meta: { orderId: order2.id } },
      { userId: customerUser.id, title: 'Order delivered!', body: "Your Mama Chika's order has been delivered. Rate your experience.", type: 'ORDER_DELIVERED', isRead: true, meta: { orderId: order1.id } },
      { userId: customerUser.id, title: 'New promo for you', body: "Mama Chika's Kitchen is offering 20% off all rice dishes. Use code RICE20.", type: 'PROMO', isRead: false },
      { userId: customerUser.id, title: 'Welcome to GoBuyMe!', body: "You've been given 2 free delivery credits. Order something delicious today!", type: 'WELCOME', isRead: true },
      // Vendor (Mama Chika)
      { userId: vendor1User.id, title: 'New order! 🔔', body: 'Order #GBM-240003 — Fried Rice + Plantain. Please prepare and confirm.', type: 'NEW_ORDER', isRead: false, meta: { orderId: order3.id } },
      { userId: vendor1User.id, title: '5-star review received', body: 'Adaeze O. rated you 5 stars: "Amazing food! Very fast delivery too."', type: 'ORDER_RATED', isRead: true, meta: { orderId: order1.id } },
      { userId: vendor1User.id, title: 'Payout processed', body: '₦5,272.50 from order #GBM-240001 has been sent to your bank account.', type: 'PAYOUT', isRead: true },
      // Rider (Emeka)
      { userId: rider1User.id, title: 'New delivery request', body: 'Pickup from QuickMart Groceries — 5 Rumuola Road. Earnings: ₦680.', type: 'NEW_DELIVERY', isRead: false, meta: { orderId: order2.id } },
      { userId: rider1User.id, title: 'Delivery complete! ✅', body: 'Order #GBM-240001 delivered. ₦595 added to your earnings.', type: 'DELIVERY_COMPLETE', isRead: true, meta: { orderId: order1.id } },
    ],
  });

  // ─── PLATFORM OFFERS ──────────────────────────────────────────────────────

  await prisma.offer.createMany({
    data: [
      { title: 'First Order Free Delivery', description: 'Free delivery on your very first order', code: 'DEMO-FIRSTORDER', discount: 100, isPercent: true, minOrder: 1000, isActive: true },
      { title: '₦500 Off Grocery Orders', description: 'Flat ₦500 discount on groceries above ₦3,000', code: 'DEMO-GROCERY500', discount: 500, isPercent: false, minOrder: 3000, isActive: true },
    ],
  });

  // ─── PAYOUT ACCOUNTS ──────────────────────────────────────────────────────

  await prisma.payoutAccount.create({
    data: { vendorId: vendor1.id, bankName: 'First Bank', accountNumber: '3012345678', accountName: "MAMA CHIKA'S KITCHEN LTD", paystackRecipientCode: 'RCP_demo_vendor1' },
  });
  await prisma.payoutAccount.create({
    data: { riderId: rider1.id, bankName: 'GTBank', accountNumber: '0087654321', accountName: 'EMEKA EZE', paystackRecipientCode: 'RCP_demo_rider1' },
  });

  // ─── SUMMARY ──────────────────────────────────────────────────────────────

  console.log('\n✅ Demo seed complete!\n');
  console.log('Demo credentials (password: Demo@2026!)');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`  Customer  : adaeze@${DEMO_DOMAIN}`);
  console.log(`  Vendor 1  : mamachika@${DEMO_DOMAIN}   (Restaurant · TIER_2 · Business Verified)`);
  console.log(`  Vendor 2  : quickmart@${DEMO_DOMAIN}   (Grocery · TIER_1 · ID Verified)`);
  console.log(`  Vendor 3  : healthplus@${DEMO_DOMAIN}  (Pharmacy · TIER_2 · Premium Verified)`);
  console.log(`  Vendor 4  : gofetch@${DEMO_DOMAIN}     (Errand · TIER_1 · Unverified)`);
  console.log(`  Rider 1   : emeka.rider@${DEMO_DOMAIN} (Online & Available)`);
  console.log(`  Rider 2   : tunde.rider@${DEMO_DOMAIN} (Offline)`);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Orders: DELIVERED, IN_TRANSIT, PREPARING, CONFIRMED, PENDING, CANCELLED');
}

seedDemo()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
