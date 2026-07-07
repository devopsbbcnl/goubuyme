// Site-wide SEO constants. NEXT_PUBLIC_SITE_URL overrides the production URL
// for staging/preview deploys.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gobuyme.shop';

export const SITE_NAME = 'GoBuyMe';

export const DEFAULT_TITLE = 'GoBuyMe — Food, Grocery & Pharmacy Delivery in Nigeria';

export const DEFAULT_DESCRIPTION =
  'Order food, groceries & medicine from 500+ vendors across Lagos, Abuja, Port Harcourt & more. Delivered in 25 minutes. Free delivery on your first app order.';

// Kept in sync with SUPPORTED_CITIES in context/CityContext.tsx (that file is a
// client module, so its exports cannot be imported into server components).
export const SEO_CITIES = [
  'Port Harcourt', 'Lagos', 'Abuja', 'Enugu', 'Owerri', 'Aba',
  'Uyo', 'Calabar', 'Benin City', 'Warri', 'Onitsha',
];

export interface FaqEntry { q: string; a: string; }

export const HOME_FAQ: FaqEntry[] = [
  {
    q: 'How fast is GoBuyMe food delivery?',
    a: 'Most GoBuyMe orders arrive in 25 minutes or less. You can track your rider live on the map from checkout to your doorstep.',
  },
  {
    q: 'Which cities in Nigeria does GoBuyMe deliver to?',
    a: 'GoBuyMe currently delivers in Port Harcourt, Lagos, Abuja, Enugu, Owerri, Aba, Uyo, Calabar, Benin City, Warri and Onitsha — and we are expanding to new cities across Nigeria.',
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
