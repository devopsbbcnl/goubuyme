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

  // ─── VENDOR 5 — Spicy Kings Shawarma (Restaurant, TIER_2, ID Verified) ──────

  const vendor5User = await prisma.user.create({
    data: {
      name: 'Chukwuma Okonkwo',
      email: `spicykings@${DEMO_DOMAIN}`,
      phone: '+2348115556677',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-SPICYKINGS',
    },
  });

  const vendor5 = await prisma.vendor.create({
    data: {
      userId: vendor5User.id,
      businessName: 'Spicy Kings Shawarma & Grills',
      slug: 'spicy-kings-shawarma',
      description: 'Lebanese-style shawarma and Nigerian suya grills, made to order. Fast, fresh, and fiery.',
      logo: 'https://picsum.photos/seed/spicykings-logo/200/200',
      coverImage: 'https://picsum.photos/seed/spicykings-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '45 Rumuobiakani Road',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.8302,
      longitude: 7.0512,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '10:00',
      closingTime: '23:00',
      rating: 4.6,
      totalRatings: 78,
      avgDeliveryTime: 25,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: vendor5.id, name: 'Chicken Shawarma Roll', description: 'Grilled chicken, crispy veg, garlic sauce in warm flatbread', price: 2200, image: 'https://picsum.photos/seed/shawarma-chicken/400/300', category: 'Shawarma', isFeatured: true, stockQuantity: 999 },
      { vendorId: vendor5.id, name: 'Beef Shawarma Roll', description: 'Seasoned minced beef, pickled veg, spicy sauce', price: 2500, image: 'https://picsum.photos/seed/shawarma-beef/400/300', category: 'Shawarma', isFeatured: true, stockQuantity: 999 },
      { vendorId: vendor5.id, name: 'Suya Stick (×5)', description: 'Classic PH-style spiced grilled beef skewers', price: 2000, image: 'https://picsum.photos/seed/suya-sticks/400/300', category: 'Grills', stockQuantity: 999 },
      { vendorId: vendor5.id, name: 'Grilled Chicken (Half)', description: 'Marinated half chicken slow-grilled over charcoal', price: 4500, image: 'https://picsum.photos/seed/grilled-chick/400/300', category: 'Grills', stockQuantity: 999 },
      { vendorId: vendor5.id, name: 'Puff Puff (×6)', description: 'Sweet deep-fried dough balls', price: 800, image: 'https://picsum.photos/seed/puff-puff-pk/400/300', category: 'Snacks', stockQuantity: 999 },
      { vendorId: vendor5.id, name: 'Soft Drink (Can)', description: 'Chilled Coke, Fanta, or Sprite', price: 400, image: 'https://picsum.photos/seed/softdrink-can/400/300', category: 'Drinks', stockQuantity: 999 },
    ],
  });

  await prisma.vendorDocument.create({
    data: {
      vendorId: vendor5.id,
      type: DocumentType.NIN,
      number: '44455566677',
      imageUrl: 'https://picsum.photos/seed/nin-doc5/400/300',
      selfieUrl: 'https://picsum.photos/seed/selfie5/400/300',
      status: DocumentStatus.VERIFIED,
    },
  });

  await prisma.vendorPromotion.create({
    data: {
      vendorId: vendor5.id,
      title: 'Buy 2 Shawarmas, Get 1 Free This Weekend!',
      imageUrl: 'https://picsum.photos/seed/promo-spicykings/1080/580',
      code: 'SKBOGO',
      isActive: true,
    },
  });

  console.log(`✓ Vendor 5 created: ${vendor5User.email} (Restaurant · Shawarma · TIER_2)`);

  // ─── VENDOR 6 — FreshMart Hypermarket (Grocery, TIER_1, Pending approval) ───

  const vendor6User = await prisma.user.create({
    data: {
      name: 'Taiwo Akinleye',
      email: `freshmart@${DEMO_DOMAIN}`,
      phone: '+2348126667788',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-FRESHMART',
    },
  });

  await prisma.vendor.create({
    data: {
      userId: vendor6User.id,
      businessName: 'FreshMart Hypermarket',
      slug: 'freshmart-hypermarket',
      description: 'Your one-stop grocery store — fresh produce, beverages, and household essentials at great prices.',
      logo: 'https://picsum.photos/seed/freshmart-logo/200/200',
      coverImage: 'https://picsum.photos/seed/freshmart-cover/1080/580',
      category: VendorCategory.GROCERY,
      address: '18 Aba Road, GRA',
      city: 'Port Harcourt',
      state: 'Rivers',
      latitude: 4.8091,
      longitude: 7.0234,
      isOpen: false,
      approvalStatus: ApprovalStatus.PENDING,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '08:00',
      closingTime: '21:00',
      avgDeliveryTime: 40,
      verificationBadge: VerificationBadge.UNVERIFIED,
      rating: 0,
      totalRatings: 0,
    },
  });

  console.log(`✓ Vendor 6 created: ${vendor6User.email} (Grocery · Pending approval — visible in admin dashboard)`);

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

  // ─── RIDER 3 — Biodun Coker (Motorcycle, Online) ──────────────────────────

  const rider3User = await prisma.user.create({
    data: {
      name: 'Biodun Coker',
      email: `biodun.rider@${DEMO_DOMAIN}`,
      phone: '+2348137778899',
      password,
      role: Role.RIDER,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-BIODUN-RIDER',
      avatar: 'https://picsum.photos/seed/biodun-rider/200/200',
    },
  });

  const rider3 = await prisma.rider.create({
    data: {
      userId: rider3User.id,
      vehicleType: 'Motorcycle',
      plateNumber: 'RSH-567-CD',
      isAvailable: true,
      isOnline: true,
      latitude: 4.821,
      longitude: 7.049,
      approvalStatus: ApprovalStatus.APPROVED,
      rating: 4.7,
      totalRatings: 52,
    },
  });

  await prisma.riderDocument.create({
    data: {
      riderId: rider3.id,
      ninNumber: '11122233344',
      ninImageUrl: 'https://picsum.photos/seed/rider3-nin/400/300',
      selfieUrl: 'https://picsum.photos/seed/rider3-selfie/400/300',
      vehicleImageUrl: 'https://picsum.photos/seed/rider3-vehicle/400/300',
      guarantorName: 'Amos Coker',
      guarantorPhone: '+2348022244455',
      guarantorAddress: '22 Bori Road, Port Harcourt',
      status: DocumentStatus.VERIFIED,
    },
  });

  console.log(`✓ Rider 3 created: ${rider3User.email} (Online)`);

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

  // ─── HISTORICAL ORDERS — last 7 days (for realistic weekly bar charts) ────
  //
  // weeklyOrders / weeklyEarnings stat endpoints count per UTC-day for the
  // trailing 7 days (index 0 = 6 days ago … index 6 = today).
  // Target for Mama Chika :  [2, 1, 3, 1, 1, 2, 2]   (includes 2 live orders today)
  // Target for QuickMart  :  [1, 1, 2, 1, 1, 1, 1]   (includes 1 live order today)
  // Rider Emeka earnings  :  [1870, 595, 3145, 1275, 1275, 1870, 0]  (₦)

  const ago = (days: number, offsetHours = 0) =>
    new Date(Date.now() - days * 86_400_000 + offsetHours * 3_600_000);

  // ── Mama Chika — 9 historical DELIVERED orders ──
  const hist1 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H001', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2500, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 187.5, totalAmount: 3200, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h001', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(6, 0),
      items: { create: [{ menuItemId: jollof!.id, name: jollof!.name, price: jollof!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist1.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist1.id, subtotal: 2500, platformFee: 187.5, netAmount: 2312.5, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist2 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H002', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 3200, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 240, totalAmount: 3900, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h002', paystackVerified: true, rating: 4, estimatedTime: 35,
      createdAt: ago(6, 5),
      items: { create: [{ menuItemId: egusi!.id, name: egusi!.name, price: egusi!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist2.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist2.id, subtotal: 3200, platformFee: 240, netAmount: 2960, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist3 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H003', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2800, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 210, totalAmount: 3500, deliveryAddress: '3 Aba Road, GRA, Port Harcourt',
      deliveryLatitude: 4.8065, deliveryLongitude: 7.0152, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h003', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(5, 1),
      items: { create: [{ menuItemId: friedR!.id, name: friedR!.name, price: friedR!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist3.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist3.id, subtotal: 2800, platformFee: 210, netAmount: 2590, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist4 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H004', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 3500, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 262.5, totalAmount: 4200, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h004', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(4, 0),
      items: { create: [{ menuItemId: banga!.id, name: banga!.name, price: banga!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist4.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist4.id, subtotal: 3500, platformFee: 262.5, netAmount: 3237.5, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist5 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H005', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 5000, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 375, totalAmount: 5700, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h005', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(4, 3),
      items: { create: [{ menuItemId: jollof!.id, name: jollof!.name, price: jollof!.price, quantity: 2 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist5.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist5.id, subtotal: 5000, platformFee: 375, netAmount: 4625, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist6 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H006', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 3200, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 240, totalAmount: 3900, deliveryAddress: '3 Aba Road, GRA, Port Harcourt',
      deliveryLatitude: 4.8065, deliveryLongitude: 7.0152, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY, paymentStatus: PaymentStatus.PAID,
      paystackRef: null, paystackVerified: false, rating: 4, estimatedTime: 35,
      createdAt: ago(4, 7),
      items: { create: [{ menuItemId: egusi!.id, name: egusi!.name, price: egusi!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist6.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist6.id, subtotal: 3200, platformFee: 240, netAmount: 2960, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist7 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H007', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2500, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 187.5, totalAmount: 3200, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h007', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(3, 1),
      items: { create: [{ menuItemId: jollof!.id, name: jollof!.name, price: jollof!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist7.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist7.id, subtotal: 2500, platformFee: 187.5, netAmount: 2312.5, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist8 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H008', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2800, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 210, totalAmount: 3500, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h008', paystackVerified: true, rating: 5, estimatedTime: 35,
      createdAt: ago(1, 0),
      items: { create: [{ menuItemId: friedR!.id, name: friedR!.name, price: friedR!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist8.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist8.id, subtotal: 2800, platformFee: 210, netAmount: 2590, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  const hist9 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-H009', customerId: customer.id, vendorId: vendor1.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 3500, deliveryFee: 700, originalDeliveryFee: 700,
      platformFee: 262.5, totalAmount: 4200, deliveryAddress: '3 Aba Road, GRA, Port Harcourt',
      deliveryLatitude: 4.8065, deliveryLongitude: 7.0152, distanceKm: 2.3,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_h009', paystackVerified: true, rating: 4, estimatedTime: 35,
      createdAt: ago(1, 5),
      items: { create: [{ menuItemId: banga!.id, name: banga!.name, price: banga!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: hist9.id, grossAmount: 700, platformCut: 105, netAmount: 595, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor1.id, orderId: hist9.id, subtotal: 3500, platformFee: 262.5, netAmount: 3237.5, commissionTier: CommissionTier.TIER_2, payoutStatus: PayoutStatus.COMPLETED } });

  console.log('✓ 9 historical orders created for Mama Chika (weekly chart: [2,1,3,1,1,2,2])');

  // ── QuickMart — 6 historical DELIVERED orders ──
  const histq1 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q001', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 4400, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 132, totalAmount: 5200, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_q001', paystackVerified: true, rating: 4, estimatedTime: 28,
      createdAt: ago(6, 2),
      items: { create: [{ menuItemId: indomie!.id, name: indomie!.name, price: indomie!.price, quantity: 2 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq1.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq1.id, subtotal: 4400, platformFee: 132, netAmount: 4268, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  const histq2 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q002', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 4500, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 135, totalAmount: 5300, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_q002', paystackVerified: true, rating: 5, estimatedTime: 28,
      createdAt: ago(4, 1),
      items: { create: [{ menuItemId: frozenChicken!.id, name: frozenChicken!.name, price: frozenChicken!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq2.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq2.id, subtotal: 4500, platformFee: 135, netAmount: 4365, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  const histq3 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q003', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2200, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 66, totalAmount: 3000, deliveryAddress: '3 Aba Road, GRA, Port Harcourt',
      deliveryLatitude: 4.8065, deliveryLongitude: 7.0152, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY, paymentStatus: PaymentStatus.PAID,
      paystackRef: null, paystackVerified: false, rating: 4, estimatedTime: 28,
      createdAt: ago(4, 6),
      items: { create: [{ menuItemId: indomie!.id, name: indomie!.name, price: indomie!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq3.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq3.id, subtotal: 2200, platformFee: 66, netAmount: 2134, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  const histq4 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q004', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 4500, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 135, totalAmount: 5300, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_q004', paystackVerified: true, rating: 5, estimatedTime: 28,
      createdAt: ago(3, 2),
      items: { create: [{ menuItemId: frozenChicken!.id, name: frozenChicken!.name, price: frozenChicken!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq4.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq4.id, subtotal: 4500, platformFee: 135, netAmount: 4365, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  const histq5 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q005', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 2200, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 66, totalAmount: 3000, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_q005', paystackVerified: true, rating: 4, estimatedTime: 28,
      createdAt: ago(2, 3),
      items: { create: [{ menuItemId: indomie!.id, name: indomie!.name, price: indomie!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq5.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq5.id, subtotal: 2200, platformFee: 66, netAmount: 2134, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  const histq6 = await prisma.order.create({
    data: {
      orderNumber: 'GBM-Q006', customerId: customer.id, vendorId: vendor2.id, riderId: rider1.id,
      status: OrderStatus.DELIVERED, subtotal: 4500, deliveryFee: 800, originalDeliveryFee: 800,
      platformFee: 135, totalAmount: 5300, deliveryAddress: '15 Rumuola Road, Port Harcourt',
      deliveryLatitude: 4.8241, deliveryLongitude: 7.0483, distanceKm: 3.1,
      paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID,
      paystackRef: 'ps_q006', paystackVerified: true, rating: 5, estimatedTime: 28,
      createdAt: ago(1, 3),
      items: { create: [{ menuItemId: frozenChicken!.id, name: frozenChicken!.name, price: frozenChicken!.price, quantity: 1 }] },
    },
  });
  await prisma.earning.create({ data: { riderId: rider1.id, orderId: histq6.id, grossAmount: 800, platformCut: 120, netAmount: 680, payoutStatus: PayoutStatus.COMPLETED } });
  await prisma.vendorPayout.create({ data: { vendorId: vendor2.id, orderId: histq6.id, subtotal: 4500, platformFee: 135, netAmount: 4365, commissionTier: CommissionTier.TIER_1, payoutStatus: PayoutStatus.COMPLETED } });

  console.log('✓ 6 historical orders created for QuickMart (weekly chart: [1,1,2,1,1,1,1])');
  console.log('  Rider Emeka weekly earnings: [1870, 595, 3145, 1275, 1275, 1870, 0] ₦');

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

  // ─── MULTI-CITY VENDORS (Lagos + Abuja) — for city-filter testing ─────────

  // Lagos 1 — Yellow Chilli Restaurant (TIER_2, active promo)
  const lagosV1User = await prisma.user.create({
    data: {
      name: 'Funmi Adeyemi',
      email: `yellowchilli@${DEMO_DOMAIN}`,
      phone: '+2348141112233',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-YELLOWCHILLI',
    },
  });

  const lagosV1 = await prisma.vendor.create({
    data: {
      userId: lagosV1User.id,
      businessName: 'Yellow Chilli Restaurant',
      slug: 'yellow-chilli-restaurant',
      description: 'Bold West African flavours — from pepper soup to asun, served hot and fresh across Lagos.',
      logo: 'https://picsum.photos/seed/yellowchilli-logo/200/200',
      coverImage: 'https://picsum.photos/seed/yellowchilli-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '14 Admiralty Way, Lekki Phase 1',
      city: 'Lagos',
      state: 'Lagos',
      latitude: 6.4281,
      longitude: 3.4219,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '10:00',
      closingTime: '22:00',
      rating: 4.8,
      totalRatings: 203,
      avgDeliveryTime: 30,
      verificationBadge: VerificationBadge.BUSINESS_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: lagosV1.id, name: 'Asun (Spicy Goat Meat)', description: 'Smoky peppered goat — Lagos party staple', price: 3800, image: 'https://picsum.photos/seed/asun/400/300', category: 'Grills', isFeatured: true, stockQuantity: 999 },
      { vendorId: lagosV1.id, name: 'Pounded Yam + Egusi', description: 'Freshly pounded with rich egusi soup', price: 3200, image: 'https://picsum.photos/seed/py-egusi/400/300', category: 'Soups & Swallow', stockQuantity: 999 },
      { vendorId: lagosV1.id, name: 'Fried Plantain (Dodo)', description: 'Perfectly golden slices of ripe plantain', price: 900, image: 'https://picsum.photos/seed/dodo-lg/400/300', category: 'Sides', stockQuantity: 999 },
      { vendorId: lagosV1.id, name: 'Pepper Soup (Goat)', description: 'Hot goat pepper soup with utazi leaves', price: 4200, image: 'https://picsum.photos/seed/goat-ps/400/300', category: 'Specials', stockQuantity: 999 },
      { vendorId: lagosV1.id, name: 'Party Jollof (Large)', description: 'Smoky tomato jollof for two', price: 4500, image: 'https://picsum.photos/seed/jollof-lg/400/300', category: 'Rice Dishes', isFeatured: true, stockQuantity: 999 },
    ],
  });

  await prisma.vendorPromotion.create({
    data: {
      vendorId: lagosV1.id,
      title: 'Lagos Special: 15% Off All Grills This Weekend!',
      imageUrl: 'https://picsum.photos/seed/promo-yellowchilli/1080/580',
      code: 'GRILL15',
      isActive: true,
    },
  });

  console.log(`✓ Lagos Vendor 1 created: ${lagosV1User.email} (Restaurant)`);

  // Lagos 2 — FreshBasket Supermarket (GROCERY, TIER_1)
  const lagosV2User = await prisma.user.create({
    data: {
      name: 'Seun Ogundimu',
      email: `freshbasket@${DEMO_DOMAIN}`,
      phone: '+2348152223344',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-FRESHBASKET',
    },
  });

  const lagosV2 = await prisma.vendor.create({
    data: {
      userId: lagosV2User.id,
      businessName: 'FreshBasket Supermarket',
      slug: 'freshbasket-supermarket',
      description: 'Quality groceries and fresh produce delivered fast across Lagos Island and Mainland.',
      logo: 'https://picsum.photos/seed/freshbasket-logo/200/200',
      coverImage: 'https://picsum.photos/seed/freshbasket-cover/1080/580',
      category: VendorCategory.GROCERY,
      address: '7 Kofo Abayomi Street, Victoria Island',
      city: 'Lagos',
      state: 'Lagos',
      latitude: 6.4269,
      longitude: 3.4163,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '07:00',
      closingTime: '21:00',
      rating: 4.4,
      totalRatings: 118,
      avgDeliveryTime: 35,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: lagosV2.id, name: 'Semovita (2 kg)', price: 2800, image: 'https://picsum.photos/seed/semovita/400/300', category: 'Dry Goods', isFeatured: true, stockQuantity: 999 },
      { vendorId: lagosV2.id, name: 'Titus Fish (1 kg)', description: 'Frozen titus mackerel', price: 3500, image: 'https://picsum.photos/seed/titus-fish/400/300', category: 'Meat & Fish', stockQuantity: 999 },
      { vendorId: lagosV2.id, name: 'Groundnut Oil (2 L)', price: 4200, image: 'https://picsum.photos/seed/gnut-oil/400/300', category: 'Cooking Essentials', isFeatured: true, stockQuantity: 999 },
      { vendorId: lagosV2.id, name: 'Tomato Paste (800 g)', price: 1100, image: 'https://picsum.photos/seed/tom-paste/400/300', category: 'Cooking Essentials', stockQuantity: 999 },
    ],
  });

  console.log(`✓ Lagos Vendor 2 created: ${lagosV2User.email} (Grocery)`);

  // Abuja 1 — The Buka Spot (RESTAURANT, TIER_2, ID Verified)
  const abujaV1User = await prisma.user.create({
    data: {
      name: 'Amina Musa',
      email: `thebukaspot@${DEMO_DOMAIN}`,
      phone: '+2348163334455',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-BUKASPOT',
    },
  });

  const abujaV1 = await prisma.vendor.create({
    data: {
      userId: abujaV1User.id,
      businessName: 'The Buka Spot',
      slug: 'the-buka-spot',
      description: 'Authentic Nigerian buka experience — tuwo shinkafa, miyan kuka, and Northern delicacies, delivered hot in Abuja.',
      logo: 'https://picsum.photos/seed/bukaspot-logo/200/200',
      coverImage: 'https://picsum.photos/seed/bukaspot-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '3 Aminu Kano Crescent, Wuse 2',
      city: 'Abuja',
      state: 'FCT',
      latitude: 9.0643,
      longitude: 7.4892,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '09:00',
      closingTime: '21:00',
      rating: 4.6,
      totalRatings: 89,
      avgDeliveryTime: 40,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: abujaV1.id, name: 'Tuwo Shinkafa + Miyan Kuka', description: 'Classic Northern soup with dried baobab leaves', price: 2800, image: 'https://picsum.photos/seed/tuwo-kuka/400/300', category: 'Soups & Swallow', isFeatured: true, stockQuantity: 999 },
      { vendorId: abujaV1.id, name: 'Masa + Suya', description: 'Rice cakes served with spiced beef suya', price: 2200, image: 'https://picsum.photos/seed/masa-suya/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
      { vendorId: abujaV1.id, name: 'Miyan Taushe + Tuwon Masara', description: 'Pumpkin leaf soup with cornmeal wrap', price: 2500, image: 'https://picsum.photos/seed/miyan-taushe/400/300', category: 'Soups & Swallow', stockQuantity: 999 },
      { vendorId: abujaV1.id, name: 'Kilishi (100 g)', description: 'Abuja-style dried spiced beef jerky', price: 3000, image: 'https://picsum.photos/seed/kilishi/400/300', category: 'Snacks', stockQuantity: 999 },
    ],
  });

  await prisma.vendorPromotion.create({
    data: {
      vendorId: abujaV1.id,
      title: 'Abuja Lunch Special: Free Kilishi with any Soup Order!',
      imageUrl: 'https://picsum.photos/seed/promo-bukaspot/1080/580',
      code: 'ABUJAFREE',
      isActive: true,
    },
  });

  console.log(`✓ Abuja Vendor 1 created: ${abujaV1User.email} (Restaurant)`);

  // Abuja 2 — Capital Pharmacy (PHARMACY, TIER_1)
  const abujaV2User = await prisma.user.create({
    data: {
      name: 'Dr. Ibrahim Sule',
      email: `capitalpharmacy@${DEMO_DOMAIN}`,
      phone: '+2348174445566',
      password,
      role: Role.VENDOR,
      isEmailVerified: true,
      isActive: true,
      referralCode: 'DEMO-CAPITALPHARM',
    },
  });

  const abujaV2 = await prisma.vendor.create({
    data: {
      userId: abujaV2User.id,
      businessName: 'Capital Pharmacy',
      slug: 'capital-pharmacy-abuja',
      description: 'Licensed pharmacy serving Abuja residents with genuine medications and wellness products.',
      logo: 'https://picsum.photos/seed/capitalpharm-logo/200/200',
      coverImage: 'https://picsum.photos/seed/capitalpharm-cover/1080/580',
      category: VendorCategory.PHARMACY,
      address: '22 Gana Street, Maitama',
      city: 'Abuja',
      state: 'FCT',
      latitude: 9.0736,
      longitude: 7.5011,
      isOpen: true,
      approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '08:00',
      closingTime: '20:00',
      rating: 4.5,
      totalRatings: 47,
      avgDeliveryTime: 30,
      verificationBadge: VerificationBadge.ID_VERIFIED,
      isPharmacyFlagged: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      { vendorId: abujaV2.id, name: 'Paracetamol (Strip)', price: 200, image: 'https://picsum.photos/seed/para-abj/400/300', category: 'Pain Relief', isFeatured: true, stockQuantity: 999 },
      { vendorId: abujaV2.id, name: 'Artemether-Lumefantrine (6-dose)', description: 'First-line malaria treatment', price: 3500, image: 'https://picsum.photos/seed/malaria-drug/400/300', category: 'Malaria', isFeatured: true, stockQuantity: 999 },
      { vendorId: abujaV2.id, name: 'Hand Sanitizer (500 ml)', price: 1500, image: 'https://picsum.photos/seed/sanit-abj/400/300', category: 'Hygiene', stockQuantity: 999 },
    ],
  });

  console.log(`✓ Abuja Vendor 2 created: ${abujaV2User.email} (Pharmacy)`);

  // ─── MULTI-CITY VENDORS (Uyo · Calabar · Enugu · Aba · Owerri) ─────────

  // Uyo — Annang Kitchen (RESTAURANT, TIER_1)
  const uyoV1User = await prisma.user.create({
    data: {
      name: 'Ekaette Okon',
      email: `annangkitchen@${DEMO_DOMAIN}`,
      phone: '+2348181112233',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-ANNANGKITCHEN',
    },
  });
  const uyoV1 = await prisma.vendor.create({
    data: {
      userId: uyoV1User.id,
      businessName: 'Annang Kitchen',
      slug: 'annang-kitchen',
      description: 'Akwa Ibom home cooking — Afang soup, Edikang Ikong, and fresh sea food delivered hot in Uyo.',
      logo: 'https://picsum.photos/seed/annang-logo/200/200',
      coverImage: 'https://picsum.photos/seed/annang-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '8 Oron Road, Uyo',
      city: 'Uyo', state: 'Akwa Ibom',
      latitude: 5.0377, longitude: 7.9128,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '09:00', closingTime: '21:00',
      rating: 4.6, totalRatings: 61, avgDeliveryTime: 35,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: uyoV1.id, name: 'Afang Soup + Semovita', description: 'Rich Akwa Ibom Afang with waterleaf & periwinkle', price: 3200, image: 'https://picsum.photos/seed/afang/400/300', category: 'Soups & Swallow', isFeatured: true, stockQuantity: 999 },
      { vendorId: uyoV1.id, name: 'Edikang Ikong + Eba', description: 'Fluted pumpkin leaf soup with stockfish', price: 3000, image: 'https://picsum.photos/seed/edikang/400/300', category: 'Soups & Swallow', stockQuantity: 999 },
      { vendorId: uyoV1.id, name: 'Ekpang Nkukwo', description: 'Grated cocoyam rolls with periwinkle in palm oil sauce', price: 2800, image: 'https://picsum.photos/seed/ekpang/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
    ],
  });
  console.log(`✓ Uyo Vendor created: ${uyoV1User.email} (Restaurant)`);

  // Calabar — Efik Seafood House (RESTAURANT, TIER_2, active promo)
  const calabarV1User = await prisma.user.create({
    data: {
      name: 'Ifeoma Bassey',
      email: `efikseafood@${DEMO_DOMAIN}`,
      phone: '+2348192223344',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-EFIKSEAFOOD',
    },
  });
  const calabarV1 = await prisma.vendor.create({
    data: {
      userId: calabarV1User.id,
      businessName: 'Efik Seafood House',
      slug: 'efik-seafood-house',
      description: 'Authentic Cross River delicacies — Fisherman\'s soup, Ekpang Nkukwo, and fresh river seafood in Calabar.',
      logo: 'https://picsum.photos/seed/efikseafood-logo/200/200',
      coverImage: 'https://picsum.photos/seed/efikseafood-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '14 MCC Road, Calabar',
      city: 'Calabar', state: 'Cross River',
      latitude: 4.9757, longitude: 8.3417,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '09:00', closingTime: '22:00',
      rating: 4.7, totalRatings: 95, avgDeliveryTime: 30,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: calabarV1.id, name: 'Fisherman\'s Soup', description: 'Calabar-style rich seafood pepper broth', price: 4500, image: 'https://picsum.photos/seed/fishermansoup/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
      { vendorId: calabarV1.id, name: 'Afang + Fufu', description: 'Wild vegetable soup with stockfish and assorted', price: 3200, image: 'https://picsum.photos/seed/afang-fufu/400/300', category: 'Soups & Swallow', stockQuantity: 999 },
      { vendorId: calabarV1.id, name: 'Nkwobi (Cow Foot)', description: 'Spiced cow foot in palm kernel paste', price: 4000, image: 'https://picsum.photos/seed/nkwobi/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
    ],
  });
  await prisma.vendorPromotion.create({
    data: {
      vendorId: calabarV1.id,
      title: 'Calabar Carnival Special: 10% Off Seafood Orders!',
      imageUrl: 'https://picsum.photos/seed/promo-efikseafood/1080/580',
      code: 'CARNIVAL10',
      isActive: true,
    },
  });
  console.log(`✓ Calabar Vendor created: ${calabarV1User.email} (Restaurant · promo active)`);

  // Enugu — Miners Grill (RESTAURANT, TIER_2)
  const enuguV1User = await prisma.user.create({
    data: {
      name: 'Chukwuebuka Agu',
      email: `minersgrill@${DEMO_DOMAIN}`,
      phone: '+2348113334455',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-MINERSGRILL',
    },
  });
  const enuguV1 = await prisma.vendor.create({
    data: {
      userId: enuguV1User.id,
      businessName: "Miners' Grill",
      slug: 'miners-grill-enugu',
      description: 'Coal City flavours — Ofe Onugbu, Oha soup, and classic Igbo dishes delivered fresh in Enugu.',
      logo: 'https://picsum.photos/seed/minersgrill-logo/200/200',
      coverImage: 'https://picsum.photos/seed/minersgrill-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '33 Ogui Road, Enugu',
      city: 'Enugu', state: 'Enugu',
      latitude: 6.4584, longitude: 7.5464,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '08:00', closingTime: '21:00',
      rating: 4.8, totalRatings: 112, avgDeliveryTime: 30,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: enuguV1.id, name: 'Ofe Onugbu + Pounded Yam', description: 'Bitter leaf soup with stockfish and assorted meat', price: 3000, image: 'https://picsum.photos/seed/ofe-onugbu/400/300', category: 'Soups & Swallow', isFeatured: true, stockQuantity: 999 },
      { vendorId: enuguV1.id, name: 'Oha Soup + Fufu', description: 'Seasonal oha leaves in palm oil with goat meat', price: 3200, image: 'https://picsum.photos/seed/oha-enugu/400/300', category: 'Soups & Swallow', stockQuantity: 999 },
      { vendorId: enuguV1.id, name: 'Abacha (African Salad)', description: 'Spiced dried cassava with ugba, ede, and fish', price: 1800, image: 'https://picsum.photos/seed/abacha/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
    ],
  });
  console.log(`✓ Enugu Vendor 1 created: ${enuguV1User.email} (Restaurant)`);

  // Enugu — Coal City Mart (GROCERY, TIER_1)
  const enuguV2User = await prisma.user.create({
    data: {
      name: 'Ngozi Obi',
      email: `coalcitymart@${DEMO_DOMAIN}`,
      phone: '+2348124445566',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-COALCITYMART',
    },
  });
  const enuguV2 = await prisma.vendor.create({
    data: {
      userId: enuguV2User.id,
      businessName: 'Coal City Mart',
      slug: 'coal-city-mart',
      description: 'Enugu\'s favourite grocery stop — fresh produce, packaged goods, and household essentials delivered fast.',
      logo: 'https://picsum.photos/seed/coalcitymart-logo/200/200',
      coverImage: 'https://picsum.photos/seed/coalcitymart-cover/1080/580',
      category: VendorCategory.GROCERY,
      address: '7 Zik Avenue, Uwani, Enugu',
      city: 'Enugu', state: 'Enugu',
      latitude: 6.4510, longitude: 7.5392,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '07:00', closingTime: '21:00',
      rating: 4.3, totalRatings: 44, avgDeliveryTime: 40,
      verificationBadge: VerificationBadge.UNVERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: enuguV2.id, name: 'Semovita (2 kg)', price: 2600, image: 'https://picsum.photos/seed/semo-enugu/400/300', category: 'Dry Goods', isFeatured: true, stockQuantity: 999 },
      { vendorId: enuguV2.id, name: 'Palm Oil (1 L)', price: 1800, image: 'https://picsum.photos/seed/palmoil/400/300', category: 'Cooking Essentials', stockQuantity: 999 },
      { vendorId: enuguV2.id, name: 'Ogiri Okpei (Igbo Seasoning)', description: 'Traditional fermented seed seasoning', price: 400, image: 'https://picsum.photos/seed/ogiri/400/300', category: 'Seasonings', stockQuantity: 999 },
    ],
  });
  console.log(`✓ Enugu Vendor 2 created: ${enuguV2User.email} (Grocery)`);

  // Aba — Ariaria Chop House (RESTAURANT, TIER_1)
  const abaV1User = await prisma.user.create({
    data: {
      name: 'Chiamaka Nwachukwu',
      email: `ariariachophouse@${DEMO_DOMAIN}`,
      phone: '+2348135556677',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-ARIARIACOPH',
    },
  });
  const abaV1 = await prisma.vendor.create({
    data: {
      userId: abaV1User.id,
      businessName: 'Ariaria Chop House',
      slug: 'ariaria-chop-house',
      description: 'Aba\'s go-to buka — quick Nigerian plates at market prices. Jollof, white rice, and assorted soups daily.',
      logo: 'https://picsum.photos/seed/ariariacoph-logo/200/200',
      coverImage: 'https://picsum.photos/seed/ariariacoph-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '2 Factory Road, Aba',
      city: 'Aba', state: 'Abia',
      latitude: 5.1049, longitude: 7.3672,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_1,
      openingTime: '07:00', closingTime: '20:00',
      rating: 4.4, totalRatings: 57, avgDeliveryTime: 25,
      verificationBadge: VerificationBadge.UNVERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: abaV1.id, name: 'White Rice + Stew', description: 'Plain boiled rice with rich tomato stew', price: 1500, image: 'https://picsum.photos/seed/rice-stew-aba/400/300', category: 'Rice Dishes', isFeatured: true, stockQuantity: 999 },
      { vendorId: abaV1.id, name: 'Jollof Rice + Fish', description: 'Party jollof with fried titus fish', price: 1800, image: 'https://picsum.photos/seed/jollof-aba/400/300', category: 'Rice Dishes', stockQuantity: 999 },
      { vendorId: abaV1.id, name: 'Ofe Onugbu + Pounded Yam', price: 2500, image: 'https://picsum.photos/seed/ofe-aba/400/300', category: 'Soups & Swallow', isFeatured: true, stockQuantity: 999 },
    ],
  });
  console.log(`✓ Aba Vendor created: ${abaV1User.email} (Restaurant)`);

  // Owerri — Owerre Nchaa (RESTAURANT, TIER_2, active promo)
  const owerriV1User = await prisma.user.create({
    data: {
      name: 'Adanna Eze',
      email: `owerrenchaa@${DEMO_DOMAIN}`,
      phone: '+2348146667788',
      password, role: Role.VENDOR, isEmailVerified: true, isActive: true,
      referralCode: 'DEMO-OWERRENCHAA',
    },
  });
  const owerriV1 = await prisma.vendor.create({
    data: {
      userId: owerriV1User.id,
      businessName: 'Owerre Nchaa',
      slug: 'owerre-nchaa',
      description: 'The taste of Imo — Ofe Owerre, bush meat pepper soup, and authentic Owerri favourites delivered to your door.',
      logo: 'https://picsum.photos/seed/owerrenchaa-logo/200/200',
      coverImage: 'https://picsum.photos/seed/owerrenchaa-cover/1080/580',
      category: VendorCategory.RESTAURANT,
      address: '5 Douglas Road, Owerri',
      city: 'Owerri', state: 'Imo',
      latitude: 5.4836, longitude: 7.0333,
      isOpen: true, approvalStatus: ApprovalStatus.APPROVED,
      commissionTier: CommissionTier.TIER_2,
      openingTime: '09:00', closingTime: '22:00',
      rating: 4.7, totalRatings: 83, avgDeliveryTime: 35,
      verificationBadge: VerificationBadge.ID_VERIFIED,
    },
  });
  await prisma.menuItem.createMany({
    data: [
      { vendorId: owerriV1.id, name: 'Ofe Owerre + Fufu', description: 'Imo-style soup with uziza, cocoyam & assorted', price: 3500, image: 'https://picsum.photos/seed/ofe-owerre/400/300', category: 'Soups & Swallow', isFeatured: true, stockQuantity: 999 },
      { vendorId: owerriV1.id, name: 'Bush Meat Pepper Soup', description: 'Forest game in a spiced herb broth', price: 5000, image: 'https://picsum.photos/seed/bushmeat-ps/400/300', category: 'Specials', isFeatured: true, stockQuantity: 999 },
      { vendorId: owerriV1.id, name: 'Ụtara + Ogiri Sauce', description: 'Breadfruit with traditional fermented seed sauce', price: 2200, image: 'https://picsum.photos/seed/utara/400/300', category: 'Specials', stockQuantity: 999 },
    ],
  });
  await prisma.vendorPromotion.create({
    data: {
      vendorId: owerriV1.id,
      title: 'Owerri Special: Free Pepper Soup Side on Orders Above ₦4,000!',
      imageUrl: 'https://picsum.photos/seed/promo-owerrenchaa/1080/580',
      code: 'OWERRI4K',
      isActive: true,
    },
  });
  console.log(`✓ Owerri Vendor created: ${owerriV1User.email} (Restaurant · promo active)`);

  // ─── SUMMARY ──────────────────────────────────────────────────────────────

  console.log('\n✅ Demo seed complete!\n');
  console.log('Demo credentials (password: Demo@2026!)');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`  Customer        : adaeze@${DEMO_DOMAIN}`);
  console.log('  — Port Harcourt vendors —');
  console.log(`  Vendor 1        : mamachika@${DEMO_DOMAIN}      (Restaurant · TIER_2 · Business Verified)`);
  console.log(`  Vendor 2        : quickmart@${DEMO_DOMAIN}      (Grocery · TIER_1 · ID Verified)`);
  console.log(`  Vendor 3        : healthplus@${DEMO_DOMAIN}     (Pharmacy · TIER_2 · Premium Verified)`);
  console.log(`  Vendor 4        : gofetch@${DEMO_DOMAIN}        (Errand · TIER_1 · Unverified)`);
  console.log(`  Vendor 5        : spicykings@${DEMO_DOMAIN}     (Restaurant · TIER_2 · promo active)`);
  console.log(`  Vendor 6        : freshmart@${DEMO_DOMAIN}      (Grocery · TIER_1 · PENDING)`);
  console.log('  — Lagos vendors —');
  console.log(`  Lagos Vendor 1  : yellowchilli@${DEMO_DOMAIN}   (Restaurant · TIER_2 · promo active)`);
  console.log(`  Lagos Vendor 2  : freshbasket@${DEMO_DOMAIN}    (Grocery · TIER_1 · ID Verified)`);
  console.log('  — Abuja vendors —');
  console.log(`  Abuja Vendor 1  : thebukaspot@${DEMO_DOMAIN}    (Restaurant · TIER_2 · promo active)`);
  console.log(`  Abuja Vendor 2  : capitalpharmacy@${DEMO_DOMAIN} (Pharmacy · TIER_1 · ID Verified)`);
  console.log('  — Uyo / Calabar / Enugu / Aba / Owerri vendors —');
  console.log(`  Uyo Vendor      : annangkitchen@${DEMO_DOMAIN}    (Restaurant · TIER_1)`);
  console.log(`  Calabar Vendor  : efikseafood@${DEMO_DOMAIN}      (Restaurant · TIER_2 · promo active)`);
  console.log(`  Enugu Vendor 1  : minersgrill@${DEMO_DOMAIN}      (Restaurant · TIER_2)`);
  console.log(`  Enugu Vendor 2  : coalcitymart@${DEMO_DOMAIN}     (Grocery · TIER_1)`);
  console.log(`  Aba Vendor      : ariariachophouse@${DEMO_DOMAIN} (Restaurant · TIER_1)`);
  console.log(`  Owerri Vendor   : owerrenchaa@${DEMO_DOMAIN}      (Restaurant · TIER_2 · promo active)`);
  console.log('  — Riders —');
  console.log(`  Rider 1         : emeka.rider@${DEMO_DOMAIN}    (Online & Available)`);
  console.log(`  Rider 2         : tunde.rider@${DEMO_DOMAIN}    (Offline)`);
  console.log(`  Rider 3         : biodun.rider@${DEMO_DOMAIN}   (Online)`);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('City filter: PH=5, Lagos=2, Abuja=2, Uyo=1, Calabar=1, Enugu=2, Aba=1, Owerri=1');
  console.log('Orders: 6 live (all statuses) + 15 historical (7-day bar charts)');
}

seedDemo()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
