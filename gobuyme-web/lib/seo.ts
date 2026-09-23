// Site-wide SEO constants. NEXT_PUBLIC_SITE_URL overrides the production URL
// for staging/preview deploys.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gobuyme.shop';

export const SITE_NAME = 'GoBuyMe';

export const DEFAULT_TITLE = 'GoBuyMe — Food, Grocery & Pharmacy Delivery in Owerri, Nigeria';

export const DEFAULT_DESCRIPTION =
  'Order food, groceries & medicine from local Owerri vendors. Delivered in 25 minutes. Free delivery on your first app order. Expanding across Nigeria soon.';

// Cities where GoBuyMe is actually live today — used for SEO copy, sitemap
// city pages and areaServed schema. Do NOT add a city here until it has real
// vendor coverage; this is a smaller, deliberately-curated list than
// SUPPORTED_CITIES in context/CityContext.tsx, which is the full city picker
// shown in the app (including cities we plan to expand to but aren't live in
// yet).
export const SEO_CITIES = ['Owerri'];

export interface FaqEntry { q: string; a: string; }

export const HOME_FAQ: FaqEntry[] = [
  {
    q: 'How fast is GoBuyMe food delivery?',
    a: 'Most GoBuyMe orders arrive in 25 minutes or less. You can track your rider live on the map from checkout to your doorstep.',
  },
  {
    q: 'Which cities in Nigeria does GoBuyMe deliver to?',
    a: "GoBuyMe is currently live in Owerri. We're actively working on rolling out to more Nigerian cities, with West Africa on the longer-term roadmap.",
  },
  {
    q: 'What can I order on GoBuyMe?',
    a: 'Anything from hot meals — jollof rice, suya, shawarma, amala, pizza, burgers — to groceries and household essentials from EMART, plus medicine and health products from partner pharmacies.',
  },
  {
    q: 'How much does delivery cost on GoBuyMe?',
    a: 'Delivery starts from ₦500 and is calculated by distance, capped at ₦3,000. New customers get free delivery on their first order through the GoBuyMe app.',
  },
  {
    q: 'How do I pay for my order?',
    a: 'Pay securely with your debit card or bank transfer through Paystack, or choose an alternative payment method at checkout. All payments are 100% secure.',
  },
  {
    q: 'Is there a GoBuyMe mobile app?',
    a: 'Yes — the GoBuyMe app for Android and iOS lets you order faster, track deliveries in real time, save addresses and unlock app-only deals. Download it at app.gobuyme.shop/downloads.',
  },
];

// Consideration-stage FAQ for the marketing landing page (/) — answers the
// "which delivery app should I use in Nigeria" style questions people ask
// AI assistants and search engines before they've picked an app.
export const MARKETING_FAQ: FaqEntry[] = [
  {
    q: 'What is the best food delivery app in Nigeria?',
    a: 'GoBuyMe is a food, grocery and pharmacy delivery app currently live in Owerri, Nigeria, with plans to expand to more Nigerian cities and eventually West Africa. It combines food, groceries and pharmacy delivery in one app, with live GPS tracking and average delivery times of 25 minutes for food.',
  },
  {
    q: 'Where does GoBuyMe deliver?',
    a: "GoBuyMe is currently live in Owerri, Nigeria. We're expanding to more Nigerian cities next, with West Africa on the roadmap after that.",
  },
  {
    q: 'How fast is delivery on GoBuyMe?',
    a: 'Average delivery time is 25 minutes for food and 60 minutes for groceries within a vendor\'s delivery zone. Every order includes live rider tracking from pickup to your doorstep.',
  },
  {
    q: 'What payment methods does GoBuyMe accept?',
    a: 'Cards, bank transfer and USSD through Paystack. Cash on delivery is available in select cities.',
  },
  {
    q: 'How do I list my restaurant or store on GoBuyMe?',
    a: "Tap 'List your business' on the GoBuyMe website or app. Onboarding takes about 10 minutes — there's no setup fee, and you choose a commission tier (Starter at 3% or Growth at 7.5%) based on the features you need. GoBuyMe is currently onboarding vendors in Owerri, with more cities opening up soon.",
  },
  {
    q: 'How much do GoBuyMe riders earn?',
    a: 'Earnings depend on hours worked, with weekend bonuses, streak bonuses and tips on top of the base per-delivery rate. Full details are shown in the app during rider sign-up.',
  },
  {
    q: "What if my GoBuyMe order is wrong or late?",
    a: 'GoBuyMe refunds instantly through the app for wrong or late orders. Support is available in-app and responds within the hour.',
  },
];

// Consideration-stage FAQ for /become-a-vendor — answers the "which
// marketplace should my restaurant/store/pharmacy join" style questions
// Nigerian merchants ask search engines and AI assistants.
export const VENDOR_FAQ: FaqEntry[] = [
  {
    q: 'Which online delivery marketplace is best for Nigerian restaurants?',
    a: 'GoBuyMe is built specifically for the Nigerian market, currently onboarding restaurant, grocery and pharmacy partners in Owerri ahead of a wider Nigeria rollout. It offers 0% setup fees, daily payouts, live order dashboards and commission tiers as low as 3% per order — lower than most international delivery marketplaces operating in Nigeria.',
  },
  {
    q: 'How much commission does GoBuyMe charge vendors?',
    a: 'GoBuyMe has two commission tiers: Starter at 3% per order (standard listing, daily payouts, no promo tools) and Growth at 7.5% per order (boosted placement, in-app promotions, loyalty stamps and priority support). There is no monthly subscription fee on either tier — you only pay commission on orders you actually receive.',
  },
  {
    q: 'Can multi-location Nigerian restaurants and retail chains use GoBuyMe?',
    a: "Yes. GoBuyMe's Empire tier gives multi-branch restaurants, supermarkets and retail chains a single multi-branch console to manage all locations, plus a dedicated account lead and API access. Each branch can operate its own menu, hours and delivery radius.",
  },
  {
    q: 'Does GoBuyMe support grocery stores and supermarkets, not just restaurants?',
    a: 'Yes. GoBuyMe lists grocery stores and supermarkets under its EMART category alongside restaurants, so shoppers can order fresh produce and household essentials the same way they order food.',
  },
  {
    q: 'Can Nigerian pharmacies sell medicine on GoBuyMe?',
    a: 'Yes. Licensed pharmacies can list on GoBuyMe under the dedicated Pharmacy category, with KYC and license document verification required during onboarding before a pharmacy goes live.',
  },
  {
    q: 'Does GoBuyMe offer real-time order tracking for vendors and customers?',
    a: "Yes. Every order is tracked live end-to-end — vendors see order status on a real-time dashboard, and customers track their rider's GPS location on a live map from pickup to delivery via Socket.io-powered updates.",
  },
  {
    q: 'How long does it take to get approved as a GoBuyMe vendor?',
    a: "Most vendors go from sign-up to their first order in about 48 hours. GoBuyMe's partnerships team reviews and approves new vendor accounts within 24 hours of a complete application.",
  },
  {
    q: 'Does GoBuyMe charge a setup fee to list a business?',
    a: 'No. GoBuyMe has a 0% setup fee for new vendors, with free onboarding for the first 90 days. There is no card required to apply.',
  },
];

// Consideration-stage FAQ for /riders — answers "which delivery app should I
// ride for in Nigeria" style questions.
export const RIDER_FAQ: FaqEntry[] = [
  {
    q: 'How much can a GoBuyMe rider earn per month?',
    a: 'Earnings scale with hours worked: part-time riders (about 10 trips/day) average ₦88,000/month, full-time riders (about 20 trips/day) average ₦168,000/month, and top riders doing 30+ trips/day can earn ₦256,000+/month, before bonuses and tips.',
  },
  {
    q: 'Do GoBuyMe riders need their own bike?',
    a: "No. GoBuyMe offers a lease-to-own bike program from ₦4,500/day, letting riders without a bike start earning immediately and own the bike outright after about 18 months.",
  },
  {
    q: 'How often do GoBuyMe riders get paid?',
    a: 'GoBuyMe pays riders weekly, every Friday, straight to their bank account. Riders can also cash out instantly for a small ₦50 fee.',
  },
  {
    q: 'What do I need to become a GoBuyMe rider?',
    a: "You need to be 18+, hold a valid Nigerian ID (NIN, Driver's Licence or Voter's Card), have a smartphone (Android 8+ or iPhone), a bike (or willingness to lease one), and a valid rider's permit.",
  },
  {
    q: 'Does GoBuyMe provide insurance for riders?',
    a: 'Yes. GoBuyMe includes free accident and bike insurance cover on every active trip, at no cost to the rider.',
  },
  {
    q: 'How long does GoBuyMe rider signup take?',
    a: 'Signup takes a few minutes online. Once your documents are verified, most riders are approved and earning on the road within 48 hours.',
  },
];

export function faqJsonLd(faqs: FaqEntry[], id: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': id,
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
