/**
 * Bulk seed — 11 cities × 28 subcategories × 5 vendors = 1,540 vendors.
 * All categories: RESTAURANT, GROCERY, PHARMACY, HOME_KITCHEN, BEAUTY, ERRAND.
 * Images sourced from Unsplash CDN (real photos, no API key required).
 * Logos generated via UI Avatars (initials-based brand logos).
 *
 * Run:   npm run bulk:seed
 * Wipe:  npm run bulk:unseed
 *
 * Password for every bulk account: Bulk@2026!
 */

import { PrismaClient, Role, VendorCategory, CommissionTier, ApprovalStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BULK_DOMAIN = 'bulk.gobuyme.ng';

// ─── CITIES ──────────────────────────────────────────────────────────────────

interface CityConfig {
  name: string;
  code: string;
  state: string;
  lat: number;
  lng: number;
  streets: string[];
}

const CITIES: CityConfig[] = [
  {
    name: 'Port Harcourt', code: 'PH', state: 'Rivers',
    lat: 4.8156, lng: 7.0498,
    streets: ['Rumuola Road', 'Peter Odili Road', 'Aba Road', 'Trans Amadi Road', 'Aggrey Road', 'Woji Road', 'Rumuobiakani Road', 'Old GRA Drive'],
  },
  {
    name: 'Lagos', code: 'LG', state: 'Lagos',
    lat: 6.5244, lng: 3.3792,
    streets: ['Admiralty Way', 'Adeola Odeku Street', 'Awolowo Road', 'Broad Street', 'Ozumba Mbadiwe Avenue', 'Bode Thomas Street', 'Allen Avenue', 'Toyin Street'],
  },
  {
    name: 'Owerri', code: 'OW', state: 'Imo',
    lat: 5.4836, lng: 7.0333,
    streets: ['Douglas Road', 'Wetheral Road', 'Mbari Street', 'Ikenegbu Road', 'Orlu Road', 'Egbu Road', 'Owerri-Onitsha Road'],
  },
  {
    name: 'Abuja', code: 'ABJ', state: 'FCT',
    lat: 9.0643, lng: 7.4892,
    streets: ['Aminu Kano Crescent', 'Gana Street', 'Aguiyi Ironsi Street', 'Ademola Adetokunbo Crescent', 'Constitution Avenue', 'Adetokunbo Ademola Crescent', 'Cadastral Zone'],
  },
  {
    name: 'Enugu', code: 'EN', state: 'Enugu',
    lat: 6.4584, lng: 7.5464,
    streets: ['Ogui Road', 'Zik Avenue', 'Independence Layout', 'GRA Road', 'Agbani Road', 'Udi Street', 'Uwani Road'],
  },
  {
    name: 'Uyo', code: 'UYO', state: 'Akwa Ibom',
    lat: 5.0377, lng: 7.9128,
    streets: ['Oron Road', 'Wellington Bassey Way', 'Nwaniba Road', 'IBB Avenue', 'Ikot Ekpene Road', 'Abak Road'],
  },
  {
    name: 'Calabar', code: 'CAL', state: 'Cross River',
    lat: 4.9757, lng: 8.3417,
    streets: ['Mary Slessor Avenue', 'Murtala Muhammed Highway', 'IBB Way', 'Ndidem Usang Iso Road', 'Cameroon Street', 'Atimbo Road'],
  },
  {
    name: 'Benin City', code: 'BN', state: 'Edo',
    lat: 6.3350, lng: 5.6037,
    streets: ['Akpakpava Road', 'Airport Road', 'Ring Road', 'Sapele Road', 'Siluko Road', 'Ekenwan Road', 'Lagos Street'],
  },
  {
    name: 'Warri', code: 'WRI', state: 'Delta',
    lat: 5.5167, lng: 5.7500,
    streets: ['Effurun-Sapele Road', 'Okumagba Avenue', 'PTI Road', 'Igbudu Road', 'Udu Road', 'Airport Road'],
  },
  {
    name: 'Onitsha', code: 'ONI', state: 'Anambra',
    lat: 6.1667, lng: 6.7833,
    streets: ['Iweka Road', 'New Market Road', 'Oguta Road', 'Modebe Avenue', 'Upper Iweka Road', 'Bridge Head Road'],
  },
  {
    name: 'Aba', code: 'ABA', state: 'Abia',
    lat: 5.1066, lng: 7.3667,
    streets: ['Ikot Ekpene Road', 'Market Road', 'Aba-Owerri Road', 'Brass Street', 'Faulks Road', 'Oguta Road'],
  },
];

// ─── IMAGE HELPERS ────────────────────────────────────────────────────────────

const unsplash = (w: number, h: number, keyword: string) =>
  `https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(keyword)}`;

const avatar = (name: string, color: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color}&color=fff&size=200&bold=true&format=png`;

const CATEGORY_COLOR: Record<string, string> = {
  RESTAURANT:   'c0392b',
  GROCERY:      '27ae60',
  PHARMACY:     '2980b9',
  HOME_KITCHEN: 'e67e22',
  BEAUTY:       '8e44ad',
  ERRAND:       '16a085',
};

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface MenuTemplate {
  name: string;
  description: string;
  price: number;
  itemCategory: string;
  imgKeyword: string;
  isFeatured?: boolean;
}

interface VendorArchetype {
  nameTemplate: string;
  descTemplate: string;
  tier: 'TIER_1' | 'TIER_2';
  openingTime: string;
  closingTime: string;
  avgDeliveryTime: number;
}

interface SubcategoryDef {
  name: string;
  coverKeyword: string;
  archetypes: VendorArchetype[];
  menuTemplates: MenuTemplate[];
}

// ─── SUBCATEGORY DATA ─────────────────────────────────────────────────────────

const SUBCATEGORIES: Record<string, SubcategoryDef[]> = {

  // ── RESTAURANT ──────────────────────────────────────────────────────────────

  RESTAURANT: [
    {
      name: 'Local Buka',
      coverKeyword: 'nigerian food traditional cooking',
      archetypes: [
        { nameTemplate: 'Mama {City} Kitchen',       descTemplate: 'Authentic home-style {City} cooking — soups, swallows, and stews made fresh daily.',               tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Home Delicacies',    descTemplate: 'Traditional Nigerian meals served hot and fresh in the heart of {City}.',                           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'Iya Agba {Code} Buka',      descTemplate: "Grandma's recipes at your doorstep — the real taste of {City} home cooking.",                     tier: 'TIER_1', openingTime: '07:30', closingTime: '19:30', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Village Kitchen',    descTemplate: 'Farm-to-table Nigerian classics cooked the traditional way, delivered across {City}.',              tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 28 },
        { nameTemplate: 'Naija Taste {Code}',        descTemplate: 'Pure Nigerian buka experience — from ofe onugbu to egusi, served with love in {City}.',            tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 22 },
      ],
      menuTemplates: [
        { name: 'Jollof Rice + Chicken',         description: 'Party-style jollof with grilled chicken',           price: 1500, itemCategory: 'Rice Dishes',    imgKeyword: 'jollof rice nigerian',    isFeatured: true },
        { name: 'Fried Rice + Beef',             description: 'Golden fried rice with stewed beef',                 price: 1400, itemCategory: 'Rice Dishes',    imgKeyword: 'fried rice food' },
        { name: 'Pounded Yam + Egusi',           description: 'Freshly pounded yam with rich egusi soup',          price: 1800, itemCategory: 'Swallow',         imgKeyword: 'nigerian soup food',      isFeatured: true },
        { name: 'Eba + Okra Soup',               description: 'Smooth cassava eba with fresh okra soup',           price: 1200, itemCategory: 'Swallow',         imgKeyword: 'okra soup' },
        { name: 'Amala + Gbegiri',               description: 'Yam flour amala with smooth beans soup',            price: 1300, itemCategory: 'Swallow',         imgKeyword: 'nigerian amala' },
        { name: 'Ofe Onugbu (Bitter Leaf Soup)', description: 'Igbo-style bitter leaf soup with assorted meat',    price: 1600, itemCategory: 'Swallow',         imgKeyword: 'nigerian stew soup' },
        { name: 'Moi Moi',                       description: 'Steamed bean pudding with egg and fish',            price: 700,  itemCategory: 'Sides',           imgKeyword: 'bean pudding nigerian' },
        { name: 'Fried Plantain (Dodo)',         description: 'Golden ripe plantain, perfectly fried',             price: 600,  itemCategory: 'Sides',           imgKeyword: 'fried plantain' },
      ],
    },
    {
      name: 'Fast Food',
      coverKeyword: 'fast food restaurant burger',
      archetypes: [
        { nameTemplate: '{City} Quick Bites',       descTemplate: 'Quick, delicious meals served fast — burgers, chicken, and more in {City}.',     tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Speed Eats {Code}',        descTemplate: 'Hot fast food delivered to your door in {City} — speed is our specialty.',         tier: 'TIER_1', openingTime: '09:00', closingTime: '23:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Chop Chop',         descTemplate: 'Fast Nigerian-inspired meals done right — tasty, affordable, and quick in {City}.', tier: 'TIER_1', openingTime: '08:30', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Fast N Fresh {Code}',      descTemplate: 'Freshly prepared fast food — no compromise on taste, no waiting long in {City}.',  tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 15 },
        { nameTemplate: '{City} Quickserve',        descTemplate: 'Your favourite fast food joint in {City} — burgers, wraps, fries, and more.',       tier: 'TIER_1', openingTime: '09:00', closingTime: '22:00', avgDeliveryTime: 20 },
      ],
      menuTemplates: [
        { name: 'Crispy Fried Chicken',     description: '4-piece crispy seasoned chicken',              price: 2200, itemCategory: 'Chicken',  imgKeyword: 'fried chicken crispy',   isFeatured: true },
        { name: 'Beef Burger',             description: 'Juicy beef patty with lettuce and sauce',       price: 2500, itemCategory: 'Burgers',  imgKeyword: 'beef burger',            isFeatured: true },
        { name: 'Chicken Burger',          description: 'Grilled chicken with mayo and pickles',         price: 2300, itemCategory: 'Burgers',  imgKeyword: 'chicken burger' },
        { name: 'French Fries (Large)',    description: 'Crispy golden fries lightly salted',            price: 900,  itemCategory: 'Sides',    imgKeyword: 'french fries' },
        { name: 'Chicken Wrap',            description: 'Grilled chicken strips wrapped in flatbread',   price: 2000, itemCategory: 'Wraps',    imgKeyword: 'chicken wrap tortilla' },
        { name: 'Chicken Nuggets (10 pc)', description: 'Tender chicken nuggets with dipping sauce',    price: 1800, itemCategory: 'Chicken',  imgKeyword: 'chicken nuggets' },
        { name: 'Coleslaw',               description: 'Creamy fresh coleslaw side',                    price: 500,  itemCategory: 'Sides',    imgKeyword: 'coleslaw salad' },
        { name: 'Soft Drink (50 cl)',      description: 'Choice of Coke, Pepsi, or Fanta',              price: 400,  itemCategory: 'Drinks',   imgKeyword: 'soft drink bottle' },
      ],
    },
    {
      name: 'Grills & BBQ',
      coverKeyword: 'suya bbq grilled meat nigeria',
      archetypes: [
        { nameTemplate: '{City} Suya Spot',    descTemplate: 'Premium suya and grilled meats delivered hot from the heart of {City}.',              tier: 'TIER_2', openingTime: '12:00', closingTime: '23:00', avgDeliveryTime: 30 },
        { nameTemplate: 'Flame & Spice {Code}', descTemplate: 'Open-flame grills, spiced to perfection — the best BBQ experience in {City}.',      tier: 'TIER_2', openingTime: '14:00', closingTime: '23:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} BBQ Palace',   descTemplate: 'From suya to asun — a full BBQ palace serving {City} with fire and flavour.',         tier: 'TIER_1', openingTime: '13:00', closingTime: '22:00', avgDeliveryTime: 25 },
        { nameTemplate: 'The Grill House {Code}', descTemplate: 'Expertly grilled meats and skewers delivered fresh to your door in {City}.',      tier: 'TIER_2', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Asun Joint',   descTemplate: 'Smoky peppered goat, suya, and assorted grills — the taste of {City} at night.',     tier: 'TIER_1', openingTime: '15:00', closingTime: '24:00', avgDeliveryTime: 35 },
      ],
      menuTemplates: [
        { name: 'Suya (200g)',               description: 'Spiced beef skewers with yaji seasoning',          price: 2500, itemCategory: 'Suya',        imgKeyword: 'suya nigerian spiced beef', isFeatured: true },
        { name: 'Asun (Peppered Goat)',      description: 'Smoky grilled goat meat tossed in chilli',         price: 3500, itemCategory: 'Asun',        imgKeyword: 'grilled goat meat',         isFeatured: true },
        { name: 'Chicken Suya',             description: 'Grilled chicken strips with suya spice',            price: 2200, itemCategory: 'Suya',        imgKeyword: 'grilled chicken skewer' },
        { name: 'Fish Pepper Soup',         description: 'Hot spiced catfish pepper soup',                    price: 3000, itemCategory: 'Specials',    imgKeyword: 'fish soup nigeria' },
        { name: 'Pork Ribs (250g)',         description: 'Slow-smoked pork ribs with BBQ glaze',              price: 4500, itemCategory: 'BBQ',         imgKeyword: 'pork ribs bbq' },
        { name: 'Chicken Laps (2 pc)',      description: 'Charcoal-grilled seasoned chicken legs',            price: 3000, itemCategory: 'Grills',      imgKeyword: 'grilled chicken legs' },
        { name: 'Gizzard & Liver (150g)',   description: 'Peppered gizzard and liver skewer',                 price: 2000, itemCategory: 'Grills',      imgKeyword: 'chicken gizzard grilled' },
        { name: 'Plantain (Roasted)',       description: 'Charcoal-roasted ripe plantain side',              price: 700,  itemCategory: 'Sides',       imgKeyword: 'roasted plantain' },
      ],
    },
    {
      name: 'Shawarma & Snacks',
      coverKeyword: 'shawarma wrap street food snacks',
      archetypes: [
        { nameTemplate: '{City} Shawarma Hub',   descTemplate: 'The best shawarma in {City} — loaded, saucy, and freshly rolled.',              tier: 'TIER_1', openingTime: '10:00', closingTime: '23:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Small Chops {Code}',    descTemplate: 'Puff puff, spring rolls, samosa — {City}\'s favourite small chops delivered.',  tier: 'TIER_1', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Wrap & Roll',    descTemplate: 'Wraps, shawarmas, and rolls made with fresh ingredients in {City}.',            tier: 'TIER_2', openingTime: '10:00', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Street Bites {Code}',   descTemplate: 'The best street snacks of {City} — freshly made and delivered to your door.',  tier: 'TIER_1', openingTime: '12:00', closingTime: '23:00', avgDeliveryTime: 15 },
        { nameTemplate: '{City} Snack Factory',  descTemplate: 'A one-stop snack shop for every craving in {City} — sweet, savoury, and spicy.', tier: 'TIER_2', openingTime: '09:00', closingTime: '22:00', avgDeliveryTime: 20 },
      ],
      menuTemplates: [
        { name: 'Chicken Shawarma',          description: 'Loaded chicken shawarma with garlic sauce and veggies', price: 2000, itemCategory: 'Shawarma', imgKeyword: 'chicken shawarma wrap',  isFeatured: true },
        { name: 'Beef Shawarma',             description: 'Grilled beef strips in flatbread with fresh toppings',  price: 2200, itemCategory: 'Shawarma', imgKeyword: 'beef shawarma',          isFeatured: true },
        { name: 'Puff Puff (6 pc)',          description: 'Soft golden Nigerian puff puff',                        price: 600,  itemCategory: 'Snacks',   imgKeyword: 'puff puff nigerian' },
        { name: 'Spring Roll (4 pc)',        description: 'Crispy vegetable spring rolls',                         price: 800,  itemCategory: 'Snacks',   imgKeyword: 'spring rolls crispy' },
        { name: 'Samosa (4 pc)',             description: 'Spiced meat-filled triangular pastry',                  price: 900,  itemCategory: 'Snacks',   imgKeyword: 'samosa fried' },
        { name: 'Meat Pie',                  description: 'Flaky pastry filled with minced meat and potatoes',     price: 700,  itemCategory: 'Snacks',   imgKeyword: 'meat pie pastry' },
        { name: 'Chin Chin (250g)',          description: 'Crunchy fried dough snack, lightly sweetened',         price: 500,  itemCategory: 'Snacks',   imgKeyword: 'chin chin snack' },
        { name: 'Doughnut (2 pc)',           description: 'Glazed Nigerian-style doughnuts',                       price: 700,  itemCategory: 'Snacks',   imgKeyword: 'doughnut glazed' },
      ],
    },
    {
      name: 'Fine Dining',
      coverKeyword: 'fine dining gourmet restaurant elegant',
      archetypes: [
        { nameTemplate: 'The {City} Table',         descTemplate: 'An elevated dining experience in {City} — farm-fresh ingredients, chef-curated menus.',          tier: 'TIER_2', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 40 },
        { nameTemplate: '{City} Gourmet Kitchen',   descTemplate: 'Fine dining brought to your door — premium {City} ingredients prepared by expert chefs.',        tier: 'TIER_2', openingTime: '11:00', closingTime: '21:00', avgDeliveryTime: 45 },
        { nameTemplate: 'La Maison {Code}',         descTemplate: 'European-inspired fine dining with a Nigerian soul, delivered across {City}.',                  tier: 'TIER_2', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 40 },
        { nameTemplate: '{City} Prestige Dining',   descTemplate: 'Prestige meals crafted with passion for {City}\'s most discerning food lovers.',                tier: 'TIER_2', openingTime: '13:00', closingTime: '22:00', avgDeliveryTime: 38 },
        { nameTemplate: 'The Grand {Code}',         descTemplate: 'Upscale Nigerian and continental cuisine from {City}\'s most celebrated kitchen.',              tier: 'TIER_2', openingTime: '11:00', closingTime: '23:00', avgDeliveryTime: 42 },
      ],
      menuTemplates: [
        { name: 'Pan-Seared Sea Bass',        description: 'Atlantic sea bass with lemon butter and asparagus',    price: 8500, itemCategory: 'Seafood',     imgKeyword: 'sea bass fish plated', isFeatured: true },
        { name: 'Wagyu Beef Tenderloin',      description: 'A5 Wagyu with truffle butter and roasted veg',         price: 15000, itemCategory: 'Beef',       imgKeyword: 'wagyu steak elegant',  isFeatured: true },
        { name: 'Lobster Bisque',             description: 'Creamy Atlantic lobster bisque with croutons',         price: 6000, itemCategory: 'Soups',       imgKeyword: 'lobster bisque soup' },
        { name: 'Duck Confit',               description: 'Slow-cooked duck leg with wild mushroom sauce',         price: 9500, itemCategory: 'Mains',       imgKeyword: 'duck confit plated' },
        { name: 'Goat Cheese Salad',         description: 'Warm goat cheese with rocket and walnuts',             price: 4500, itemCategory: 'Starters',    imgKeyword: 'goat cheese salad' },
        { name: 'Grilled Tiger Prawns',      description: '6 tiger prawns with garlic and herb butter',           price: 7500, itemCategory: 'Seafood',     imgKeyword: 'grilled prawns garlic' },
        { name: 'Crème Brûlée',             description: 'Classic vanilla crème brûlée with caramelised top',    price: 3500, itemCategory: 'Desserts',    imgKeyword: 'creme brulee dessert' },
        { name: 'Chocolate Fondant',         description: 'Warm chocolate cake with molten centre and ice cream', price: 3800, itemCategory: 'Desserts',    imgKeyword: 'chocolate fondant dessert' },
      ],
    },
    {
      name: 'Chinese & Continental',
      coverKeyword: 'chinese food noodles continental restaurant',
      archetypes: [
        { nameTemplate: '{City} Dragon Palace',        descTemplate: 'Authentic Chinese cuisine delivered to your door in {City} — dim sum, noodles, and more.',           tier: 'TIER_2', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Orient Express {Code}',       descTemplate: 'East meets West — Chinese and continental favourites served fast in {City}.',                        tier: 'TIER_1', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Continental Kitchen',  descTemplate: 'A full continental menu featuring Chinese, Italian, and European classics in {City}.',               tier: 'TIER_2', openingTime: '11:00', closingTime: '21:00', avgDeliveryTime: 38 },
        { nameTemplate: 'Golden Wok {Code}',           descTemplate: 'Wok-tossed perfection — the best Chinese takeaway experience in {City}.',                           tier: 'TIER_1', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} International Cuisine', descTemplate: 'From Peking Duck to pasta — diverse international flavours delivered across {City}.',              tier: 'TIER_2', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 35 },
      ],
      menuTemplates: [
        { name: 'Chicken Fried Rice',        description: 'Wok-tossed fried rice with egg and vegetables',        price: 2500, itemCategory: 'Rice',         imgKeyword: 'chinese fried rice', isFeatured: true },
        { name: 'Beef Noodles',              description: 'Stir-fried noodles with tender beef strips',           price: 2800, itemCategory: 'Noodles',      imgKeyword: 'beef noodles stir fry', isFeatured: true },
        { name: 'Sweet & Sour Chicken',      description: 'Crispy chicken in tangy sweet and sour sauce',         price: 3200, itemCategory: 'Chicken',      imgKeyword: 'sweet sour chicken' },
        { name: 'Dim Sum (6 pc)',            description: 'Steamed pork and prawn dumplings',                     price: 3500, itemCategory: 'Starters',    imgKeyword: 'dim sum dumplings' },
        { name: 'Seafood Fried Rice',        description: 'Fried rice with shrimp, squid, and crab',             price: 4000, itemCategory: 'Rice',         imgKeyword: 'seafood fried rice' },
        { name: 'Pepper Beef',               description: 'Wok-fried beef strips with black pepper sauce',        price: 3800, itemCategory: 'Beef',         imgKeyword: 'pepper beef stir fry' },
        { name: 'Spaghetti Bolognese',       description: 'Classic Italian pasta with rich meat sauce',           price: 3000, itemCategory: 'Pasta',        imgKeyword: 'spaghetti bolognese pasta' },
        { name: 'Vegetable Spring Roll (4)', description: 'Crispy vegetable-filled spring rolls',                 price: 1800, itemCategory: 'Starters',    imgKeyword: 'spring rolls vegetables' },
      ],
    },
  ],

  // ── GROCERY ─────────────────────────────────────────────────────────────────

  GROCERY: [
    {
      name: 'Supermarket',
      coverKeyword: 'supermarket grocery store shopping',
      archetypes: [
        { nameTemplate: '{City} Mart',              descTemplate: 'Your one-stop supermarket in {City} — groceries, household goods, and more delivered fast.',             tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: 'FreshZone {Code}',         descTemplate: 'A modern supermarket experience in {City} with thousands of products at your fingertips.',               tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} MegaStore',         descTemplate: 'The largest supermarket in {City} — everything you need, delivered to your home.',                       tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 40 },
        { nameTemplate: 'Big Value {Code}',         descTemplate: 'Unbeatable prices and quality — {City}\'s most affordable supermarket.',                                tier: 'TIER_1', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} SuperStore',        descTemplate: 'Premium grocery shopping made easy — wide range, great prices, delivered in {City}.',                   tier: 'TIER_2', openingTime: '07:30', closingTime: '22:00', avgDeliveryTime: 35 },
      ],
      menuTemplates: [
        { name: 'Golden Morn Cereal (500g)',   description: 'Nestlé Golden Morn maize cereal',                   price: 1800, itemCategory: 'Cereals & Breakfast', imgKeyword: 'cereal breakfast box', isFeatured: true },
        { name: 'Indomie Noodles (40-pack)',   description: 'Dangote Indomie instant noodles multipack',          price: 3200, itemCategory: 'Dry Foods',          imgKeyword: 'instant noodles packet' },
        { name: 'Semovita (1kg)',              description: 'De Rica semolina for swallow',                       price: 1500, itemCategory: 'Dry Foods',          imgKeyword: 'semolina flour bag' },
        { name: 'Chicken Seasoning Cubes (50)', description: 'Maggi or Knorr seasoning cubes',                  price: 800,  itemCategory: 'Seasonings',         imgKeyword: 'seasoning cubes spice' },
        { name: 'Vegetable Oil (5 L)',         description: 'Kings or Power Oil vegetable oil',                   price: 6500, itemCategory: 'Oils & Fats',       imgKeyword: 'vegetable oil bottle', isFeatured: true },
        { name: 'Tomato Paste (70g × 10)',     description: 'Gino or Tomatina tomato purée sachets',             price: 1200, itemCategory: 'Seasonings',         imgKeyword: 'tomato paste cans' },
        { name: 'Detergent Powder (1kg)',      description: 'Omo or Ariel washing powder',                       price: 2200, itemCategory: 'Household',          imgKeyword: 'laundry detergent' },
        { name: 'Toilet Rolls (12-pack)',      description: 'Soft 2-ply toilet tissue rolls',                    price: 2500, itemCategory: 'Household',          imgKeyword: 'toilet paper pack' },
      ],
    },
    {
      name: 'Fresh Produce',
      coverKeyword: 'fresh vegetables fruits market nigeria',
      archetypes: [
        { nameTemplate: '{City} Farm Fresh',    descTemplate: 'Direct from farms to your table — the freshest fruits and vegetables in {City}.',           tier: 'TIER_1', openingTime: '06:00', closingTime: '19:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Green Basket {Code}',  descTemplate: 'Seasonal, locally sourced produce delivered fresh daily across {City}.',                    tier: 'TIER_1', openingTime: '06:30', closingTime: '18:30', avgDeliveryTime: 22 },
        { nameTemplate: '{City} Market Direct', descTemplate: 'Market-fresh produce without the market hustle — delivered straight to {City} doors.',      tier: 'TIER_1', openingTime: '05:30', closingTime: '19:00', avgDeliveryTime: 25 },
        { nameTemplate: 'Fresh Picks {Code}',   descTemplate: 'Hand-picked daily from local farms — quality guaranteed, priced right in {City}.',          tier: 'TIER_2', openingTime: '06:00', closingTime: '18:00', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Veggie Hub',    descTemplate: 'Your neighbourhood fresh produce hub in {City} — greens, roots, and tropical fruits.',      tier: 'TIER_1', openingTime: '07:00', closingTime: '19:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Tomatoes (1kg)',           description: 'Ripe, fresh Roma tomatoes',                          price: 800,  itemCategory: 'Vegetables', imgKeyword: 'fresh tomatoes market', isFeatured: true },
        { name: 'Tatashe (1kg)',            description: 'Fresh red bell peppers',                             price: 1000, itemCategory: 'Vegetables', imgKeyword: 'red bell peppers fresh' },
        { name: 'Scotch Bonnet (500g)',     description: 'Fresh hot pepper (ata rodo)',                        price: 700,  itemCategory: 'Vegetables', imgKeyword: 'scotch bonnet peppers' },
        { name: 'Ugu Leaf (bundle)',        description: 'Fresh fluted pumpkin leaves',                        price: 500,  itemCategory: 'Vegetables', imgKeyword: 'pumpkin leaves green' },
        { name: 'Plantain (bunch of 7)',    description: 'Ripe and unripe plantain — specify preference',      price: 1800, itemCategory: 'Fruits',     imgKeyword: 'plantain banana bunch', isFeatured: true },
        { name: 'Pineapple (medium)',       description: 'Sweet, ripe tropical pineapple',                    price: 1200, itemCategory: 'Fruits',     imgKeyword: 'pineapple tropical fruit' },
        { name: 'Watermelon (whole)',       description: 'Juicy seedless watermelon',                         price: 2500, itemCategory: 'Fruits',     imgKeyword: 'watermelon whole' },
        { name: 'Onions (3kg)',             description: 'Medium red onions — essential for every Nigerian kitchen', price: 1500, itemCategory: 'Vegetables', imgKeyword: 'onions red market' },
      ],
    },
    {
      name: 'Packaged Foods',
      coverKeyword: 'packaged food dry goods grocery store',
      archetypes: [
        { nameTemplate: '{City} Pantry',         descTemplate: 'Stocking your pantry made easy — dry goods, canned foods, and provisions in {City}.',      tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'Pack & Stack {Code}',   descTemplate: 'Bulk or single — every packaged food item you need, delivered across {City}.',            tier: 'TIER_1', openingTime: '08:30', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Food Store',     descTemplate: 'Premium packaged foods and provisions sourced locally and internationally for {City}.',    tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 32 },
        { nameTemplate: 'Shelf Goods {Code}',    descTemplate: 'The best canned, bottled, and dry goods delivered to your {City} home without delay.',    tier: 'TIER_1', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Provisions',     descTemplate: 'Everything in a tin, pack, or bag — comprehensive provisions store serving {City}.',      tier: 'TIER_1', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Peak Milk Powder (900g)',      description: 'Peak full cream powdered milk',                      price: 5500, itemCategory: 'Dairy',        imgKeyword: 'milk powder tin', isFeatured: true },
        { name: 'Milo Tin (400g)',              description: 'Nestlé Milo chocolate malt drink',                   price: 3200, itemCategory: 'Beverages',    imgKeyword: 'milo chocolate tin' },
        { name: 'Bournvita (500g)',             description: 'Cadbury Bournvita drinking chocolate',               price: 2800, itemCategory: 'Beverages',    imgKeyword: 'cocoa drink tin' },
        { name: 'Sardines (4-pack)',            description: 'Titus or Lucky Star canned sardines',               price: 2200, itemCategory: 'Canned Foods', imgKeyword: 'sardine tin canned fish', isFeatured: true },
        { name: 'Corned Beef (200g)',           description: 'Grace or Bull\'s Head corned beef tin',             price: 1800, itemCategory: 'Canned Foods', imgKeyword: 'corned beef canned' },
        { name: 'Rice (5kg)',                   description: 'Ofada or Royal Stallion parboiled rice',            price: 5000, itemCategory: 'Grains',       imgKeyword: 'rice bag grain' },
        { name: 'Spaghetti (5-pack × 500g)',   description: 'Dangote or Honeywell spaghetti pasta',              price: 3500, itemCategory: 'Dry Foods',    imgKeyword: 'spaghetti pasta dry' },
        { name: 'Groundnut Oil (2L)',           description: 'Gino or Devon King groundnut oil',                  price: 4500, itemCategory: 'Oils',         imgKeyword: 'groundnut oil bottle' },
      ],
    },
    {
      name: 'Beverages & Drinks',
      coverKeyword: 'drinks beverages bottles juice',
      archetypes: [
        { nameTemplate: '{City} Drinks Hub',          descTemplate: 'Every beverage you crave — water, juice, soft drinks, and energy drinks in {City}.',   tier: 'TIER_1', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Sip & Quench {Code}',        descTemplate: 'Cold drinks, fresh juices, and bulk water delivery across {City}.',                   tier: 'TIER_1', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Beverage Store',      descTemplate: 'From chilled coke to fresh zobo — {City}\'s go-to drinks supplier.',                  tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Liquid Gold {Code}',         descTemplate: 'Premium beverages and bulk drinks delivered cold and fast across {City}.',             tier: 'TIER_1', openingTime: '09:00', closingTime: '23:00', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Refreshment Centre',  descTemplate: 'Your neighbourhood drinks stop — every brand, every size, delivered in {City}.',      tier: 'TIER_2', openingTime: '07:30', closingTime: '22:30', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Eva Water (6 × 1.5L)',     description: 'Nigerian Eva table water 6-bottle pack',              price: 2500, itemCategory: 'Water',       imgKeyword: 'water bottles pack', isFeatured: true },
        { name: 'Coke (12-pack × 35cl)',    description: 'Coca-Cola classic cans multipack',                    price: 4500, itemCategory: 'Soft Drinks', imgKeyword: 'coca cola cans', isFeatured: true },
        { name: 'Fanta Orange (6 × 50cl)', description: 'Fanta orange flavour glass bottles',                  price: 3000, itemCategory: 'Soft Drinks', imgKeyword: 'fanta orange bottles' },
        { name: 'Malta Guinness (6-pack)',  description: 'Guinness Malta non-alcoholic malt drink',              price: 3600, itemCategory: 'Malt',        imgKeyword: 'malt drink bottles' },
        { name: 'Five Alive Juice (1L)',    description: 'Five Alive tropical citrus blend juice',              price: 1200, itemCategory: 'Juices',      imgKeyword: 'fruit juice carton' },
        { name: 'Zobo (2L)',               description: 'Fresh homemade hibiscus drink (zoborodo)',            price: 1500, itemCategory: 'Local Drinks', imgKeyword: 'hibiscus drink red' },
        { name: 'Power Horse (4-pack)',     description: 'Energy drink — Power Horse cans',                    price: 3200, itemCategory: 'Energy Drinks', imgKeyword: 'energy drink cans' },
        { name: 'Lacasera (6-pack)',        description: 'Lacasera apple-flavoured sparkling drink',           price: 2800, itemCategory: 'Soft Drinks', imgKeyword: 'apple soda drink' },
      ],
    },
    {
      name: 'Frozen Foods',
      coverKeyword: 'frozen food fish meat ice',
      archetypes: [
        { nameTemplate: '{City} Coldstore',     descTemplate: 'Fresh-frozen meats, fish, and ready meals delivered cold to {City} homes.',                tier: 'TIER_2', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Ice Chest {Code}',     descTemplate: 'Your trusted frozen foods supplier in {City} — quality cuts, right price.',                tier: 'TIER_1', openingTime: '07:00', closingTime: '19:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Frozen Depot',  descTemplate: 'Wholesale and retail frozen foods — poultry, seafood, and more across {City}.',            tier: 'TIER_2', openingTime: '06:00', closingTime: '19:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Arctic Foods {Code}',  descTemplate: 'The coldest prices in {City} — premium frozen meats and fish delivered fast.',             tier: 'TIER_1', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} ChillBox',      descTemplate: 'Frozen to perfection — meats, seafood, and ice cream delivered across {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 32 },
      ],
      menuTemplates: [
        { name: 'Chicken (Whole, 1.5kg)',   description: 'Frozen whole broiler chicken, cleaned',                 price: 4500, itemCategory: 'Poultry',    imgKeyword: 'whole chicken frozen', isFeatured: true },
        { name: 'Croaker Fish (1kg)',       description: 'Frozen Nigerian croaker fish (drum fish)',               price: 3500, itemCategory: 'Seafood',    imgKeyword: 'croaker fish frozen',  isFeatured: true },
        { name: 'Beef (1kg, assorted)',     description: 'Mixed beef cuts — for stew, pepper soup, or barbecue',  price: 4000, itemCategory: 'Beef',        imgKeyword: 'beef cuts frozen' },
        { name: 'Prawn (500g)',             description: 'Frozen headless white prawns, cleaned',                 price: 4500, itemCategory: 'Seafood',    imgKeyword: 'prawns frozen bag' },
        { name: 'Turkey Wings (1kg)',       description: 'Frozen smoked turkey wings',                           price: 5500, itemCategory: 'Poultry',    imgKeyword: 'turkey wings frozen' },
        { name: 'Goat Meat (1kg)',          description: 'Frozen Nigerian goat meat, bone-in',                   price: 5000, itemCategory: 'Beef',        imgKeyword: 'goat meat raw' },
        { name: 'Ice Cream (1L)',           description: 'Fanmilk or Creambell vanilla / strawberry ice cream',  price: 2500, itemCategory: 'Ice Cream',  imgKeyword: 'ice cream tub' },
        { name: 'Sausage Roll (pack of 8)', description: 'Frozen ready-to-bake sausage rolls',                   price: 2200, itemCategory: 'Ready Meals', imgKeyword: 'sausage rolls baked' },
      ],
    },
  ],

  // ── PHARMACY ────────────────────────────────────────────────────────────────

  PHARMACY: [
    {
      name: 'Medications',
      coverKeyword: 'pharmacy medicine pills drugstore',
      archetypes: [
        { nameTemplate: '{City} Pharmacy',          descTemplate: 'PCN-licensed pharmacy delivering genuine medications to your door in {City}.',         tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'MedPoint {Code}',          descTemplate: 'Authentic OTC and prescription medications dispensed safely across {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} HealthCare Pharmacy', descTemplate: 'Comprehensive pharmacy services — medication dispensing and health advice in {City}.', tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 22 },
        { nameTemplate: 'PharmaCare {Code}',        descTemplate: 'Certified pharmacists ensuring you get genuine drugs at the right dosage in {City}.',  tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Drug Store',        descTemplate: 'Your trusted community drug store — OTC medications delivered fast in {City}.',        tier: 'TIER_1', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Paracetamol 500mg (24 tabs)', description: 'Panadol or generic paracetamol pain relief',       price: 400,  itemCategory: 'Pain Relief',  imgKeyword: 'medicine pills white', isFeatured: true },
        { name: 'Amoxicillin 500mg (21 caps)', description: 'Broad-spectrum antibiotic — prescription required', price: 1800, itemCategory: 'Antibiotics', imgKeyword: 'antibiotic capsules' },
        { name: 'Vitamin C 1000mg (60 tabs)',  description: 'Solgar or Seven Seas vitamin C effervescent',       price: 2200, itemCategory: 'Vitamins',    imgKeyword: 'vitamin c tablets' },
        { name: 'Buscopan (20 tabs)',          description: 'Antispasmodic for stomach cramps',                  price: 1200, itemCategory: 'Digestive',   imgKeyword: 'stomach medicine pills' },
        { name: 'Chloroquine (30 tabs)',       description: 'Anti-malarial prophylaxis and treatment',          price: 900,  itemCategory: 'Antimalarial', imgKeyword: 'malaria medicine',      isFeatured: true },
        { name: 'Loratadine 10mg (10 tabs)',   description: 'Antihistamine for allergies and hay fever',         price: 800,  itemCategory: 'Allergy',     imgKeyword: 'allergy medication' },
        { name: 'Omeprazole 20mg (14 caps)',   description: 'Proton pump inhibitor for acid reflux',            price: 1500, itemCategory: 'Digestive',   imgKeyword: 'capsule medicine' },
        { name: 'ORS Sachet (10-pack)',        description: 'Oral Rehydration Salt for dehydration',            price: 700,  itemCategory: 'Rehydration', imgKeyword: 'oral rehydration sachet' },
      ],
    },
    {
      name: 'Vitamins & Supplements',
      coverKeyword: 'vitamins supplements health nutrition',
      archetypes: [
        { nameTemplate: '{City} Wellness Hub',      descTemplate: 'Premium vitamins and health supplements delivered to wellness seekers in {City}.',       tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: 'VitaPlus {Code}',          descTemplate: 'Your {City} source for authentic vitamins, minerals, and dietary supplements.',          tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Health Supplements', descTemplate: 'International-grade supplements at local prices — delivered across {City}.',            tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'NutriStore {Code}',        descTemplate: 'Sports nutrition, vitamins, and supplements for a healthier {City}.',                    tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Vitality Pharmacy', descTemplate: 'Fuel your health journey — quality supplements sourced from trusted brands in {City}.',  tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 27 },
      ],
      menuTemplates: [
        { name: 'Omega-3 Fish Oil (90 softgels)',  description: 'Seven Seas or Nature\'s Bounty omega-3 supplement',  price: 5500, itemCategory: 'Omega',        imgKeyword: 'omega fish oil capsules', isFeatured: true },
        { name: 'Multivitamin (60 tabs)',           description: 'Centrum or Nature\'s Bounty complete multivitamin',  price: 4500, itemCategory: 'Multivitamin',  imgKeyword: 'multivitamin tablets', isFeatured: true },
        { name: 'Vitamin D3 1000IU (90 tabs)',      description: 'Bone health and immune support vitamin D3',          price: 3500, itemCategory: 'Vitamins',      imgKeyword: 'vitamin d supplement' },
        { name: 'Zinc 50mg (60 tabs)',              description: 'Immune-boosting zinc mineral supplement',           price: 2800, itemCategory: 'Minerals',      imgKeyword: 'zinc supplement pills' },
        { name: 'Whey Protein (1kg)',              description: 'Optimum Nutrition Gold Standard whey protein',       price: 22000, itemCategory: 'Sports Nutrition', imgKeyword: 'protein powder tub' },
        { name: 'Collagen (30 sachets)',            description: 'Marine collagen peptides for skin and joints',       price: 8000, itemCategory: 'Beauty Supps', imgKeyword: 'collagen supplement powder' },
        { name: 'Probiotic (30 caps)',              description: 'Gut health probiotic with Lactobacillus strains',   price: 6500, itemCategory: 'Gut Health',    imgKeyword: 'probiotic capsules' },
        { name: 'Iron + Folic Acid (60 tabs)',      description: 'Ferrous sulphate and folic acid for anaemia',       price: 1800, itemCategory: 'Minerals',      imgKeyword: 'iron supplement tablets' },
      ],
    },
    {
      name: 'Baby & Maternal',
      coverKeyword: 'baby products maternal health newborn',
      archetypes: [
        { nameTemplate: '{City} BabyCare',          descTemplate: 'Everything for your baby and new mum — delivered safely across {City}.',                tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'MamaPlus {Code}',          descTemplate: 'Maternal health and baby essentials from certified brands — trusted by {City} families.', tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Mother & Child',    descTemplate: 'Specialist maternal and infant health products for {City}\'s growing families.',         tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 22 },
        { nameTemplate: 'TinyHearts {Code}',        descTemplate: 'Curated baby and maternal care products — from diapers to prenatal vitamins in {City}.',  tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Baby Essentials',   descTemplate: 'All your baby needs in one place — trusted brands delivered fast in {City}.',            tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Pampers Diapers (S/M/L, 50 pcs)', description: 'Pampers Active Baby diapers — pick size',          price: 7500, itemCategory: 'Diapers',     imgKeyword: 'baby diapers pampers', isFeatured: true },
        { name: 'NAN Infant Formula (400g)',        description: 'Nestlé NAN infant formula for 0-6 months',        price: 6500, itemCategory: 'Baby Formula', imgKeyword: 'baby formula tin',     isFeatured: true },
        { name: 'Aptamil Follow-On (400g)',         description: 'Aptamil stage 2 follow-on milk 6-12 months',      price: 7200, itemCategory: 'Baby Formula', imgKeyword: 'formula milk powder baby' },
        { name: 'Cerelac Wheat (1kg)',              description: 'Nestlé Cerelac wheat cereal for 6+ months',       price: 4500, itemCategory: 'Baby Food',    imgKeyword: 'baby cereal food' },
        { name: 'Prenatal Vitamins (60 tabs)',      description: 'Comprehensive prenatal multivitamin with folic acid', price: 5500, itemCategory: 'Maternal', imgKeyword: 'prenatal vitamins pregnancy' },
        { name: 'Baby Wipes (80-pack)',             description: 'Huggies or Pampers sensitive baby wipes',          price: 1800, itemCategory: 'Baby Care',   imgKeyword: 'baby wipes packet' },
        { name: 'Johnson\'s Baby Lotion (500ml)',   description: 'Gentle moisturising baby lotion',                  price: 2500, itemCategory: 'Baby Care',   imgKeyword: 'baby lotion bottle' },
        { name: 'Gripe Water (150ml)',             description: 'Woodward\'s gripe water for infant colic',          price: 1200, itemCategory: 'Infant Care', imgKeyword: 'gripe water bottle' },
      ],
    },
    {
      name: 'Medical Devices',
      coverKeyword: 'medical equipment health devices monitor',
      archetypes: [
        { nameTemplate: '{City} MediTech',      descTemplate: 'Medical-grade devices for home health monitoring — delivered and demonstrated in {City}.',    tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: 'HealthGear {Code}',    descTemplate: 'NAFDAC-certified medical devices for {City} homes, clinics, and wellness centres.',           tier: 'TIER_1', openingTime: '09:00', closingTime: '19:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Medical Supplies', descTemplate: 'Clinical and home-use medical supplies for {City} health professionals and families.',     tier: 'TIER_2', openingTime: '07:30', closingTime: '19:30', avgDeliveryTime: 32 },
        { nameTemplate: 'ProMed {Code}',        descTemplate: 'Professional-grade health monitoring equipment sold and delivered in {City}.',                tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} Diagnostic Store', descTemplate: 'Diagnostic tools for home use — glucometers, BP monitors, and more in {City}.',           tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
      ],
      menuTemplates: [
        { name: 'Blood Pressure Monitor (Omron)', description: 'Omron M3 automatic upper arm BP monitor',            price: 22000, itemCategory: 'BP Monitors',    imgKeyword: 'blood pressure monitor', isFeatured: true },
        { name: 'Digital Thermometer',           description: 'Infrared non-contact forehead thermometer',            price: 8500,  itemCategory: 'Thermometers',  imgKeyword: 'digital thermometer', isFeatured: true },
        { name: 'Glucometer Kit (Accu-Chek)',    description: 'Roche Accu-Chek blood glucose monitor + 50 strips',   price: 18000, itemCategory: 'Glucose',       imgKeyword: 'glucometer diabetes' },
        { name: 'Pulse Oximeter',               description: 'Fingertip SpO2 and heart rate monitor',               price: 7500,  itemCategory: 'Oxygen',        imgKeyword: 'pulse oximeter finger' },
        { name: 'Stethoscope (Littmann)',       description: 'Classic III stethoscope for clinicians',              price: 35000, itemCategory: 'Clinical',      imgKeyword: 'stethoscope doctor' },
        { name: 'Nebuliser Machine',            description: 'Portable compressor nebuliser for asthma',            price: 25000, itemCategory: 'Respiratory',   imgKeyword: 'nebulizer machine' },
        { name: 'Urine Test Strips (50-pack)',  description: '10-parameter urine analysis strips',                  price: 4500,  itemCategory: 'Diagnostics',   imgKeyword: 'urine test strips' },
        { name: 'Surgical Face Masks (50-pack)', description: 'Medical-grade 3-ply disposable face masks',          price: 2500,  itemCategory: 'PPE',           imgKeyword: 'face mask medical' },
      ],
    },
  ],

  // ── HOME_KITCHEN ─────────────────────────────────────────────────────────────

  HOME_KITCHEN: [
    {
      name: 'Electronics & Gadgets',
      coverKeyword: 'electronics gadgets smartphone laptop store',
      archetypes: [
        { nameTemplate: '{City} TechHub',          descTemplate: 'Latest phones, laptops, and accessories — the best electronics mall in {City}.',         tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 40 },
        { nameTemplate: 'Gadget World {Code}',     descTemplate: 'From earbuds to smart TVs — your one-stop gadget shop in {City}.',                      tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} Electronics Mall', descTemplate: 'Genuine electronics from trusted brands, delivered across {City} with warranty.',        tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 45 },
        { nameTemplate: 'SmartShop {Code}',        descTemplate: 'Smart devices, quality tech, and accessories shipped fast to {City} customers.',         tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 38 },
        { nameTemplate: '{City} Digital Store',    descTemplate: 'Phones, computers, and accessories — authentic and warranty-backed in {City}.',          tier: 'TIER_2', openingTime: '08:30', closingTime: '20:30', avgDeliveryTime: 40 },
      ],
      menuTemplates: [
        { name: 'Bluetooth Earbuds (TWS)',        description: 'True wireless stereo earbuds with charging case',     price: 8500,  itemCategory: 'Audio',       imgKeyword: 'wireless earbuds bluetooth', isFeatured: true },
        { name: 'Power Bank (20,000mAh)',         description: 'Fast-charge power bank with USB-C',                   price: 12000, itemCategory: 'Charging',    imgKeyword: 'power bank portable',        isFeatured: true },
        { name: 'Phone Screen Protector',         description: 'Tempered glass screen guard — specify model',         price: 1500,  itemCategory: 'Accessories', imgKeyword: 'phone screen protector' },
        { name: 'USB-C Charging Cable (2m)',       description: '65W fast-charge braided USB-C cable',                price: 2500,  itemCategory: 'Charging',    imgKeyword: 'usb cable charging' },
        { name: 'Smart Watch',                   description: 'Fitness tracking smartwatch with heart rate monitor',  price: 18000, itemCategory: 'Wearables',   imgKeyword: 'smart watch fitness' },
        { name: 'Wireless Mouse',                description: 'Ergonomic rechargeable wireless mouse',               price: 6500,  itemCategory: 'Computer',    imgKeyword: 'wireless mouse computer' },
        { name: 'Phone Case (Universal)',        description: 'Heavy-duty shockproof phone case — specify model',    price: 2000,  itemCategory: 'Accessories', imgKeyword: 'phone case protection' },
        { name: 'Mini Bluetooth Speaker',        description: 'Portable waterproof Bluetooth speaker',              price: 9500,  itemCategory: 'Audio',       imgKeyword: 'bluetooth speaker portable' },
      ],
    },
    {
      name: 'Pet Supplies',
      coverKeyword: 'pet supplies dog cat food accessories',
      archetypes: [
        { nameTemplate: '{City} Pet Paradise',  descTemplate: 'Everything your pet needs — food, toys, and accessories delivered in {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'PawPrint {Code}',      descTemplate: 'Premium pet food and accessories for dogs, cats, and birds in {City}.',                  tier: 'TIER_1', openingTime: '09:00', closingTime: '19:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Animal Supplies', descTemplate: 'Veterinary-approved pet food and care products delivered across {City}.',              tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 32 },
        { nameTemplate: 'PetVault {Code}',      descTemplate: 'Your {City} pet store — quality nutrition, grooming, and health for all animals.',       tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Furry Friends', descTemplate: 'Pamper your pet — curated supplies and nutrition from {City}\'s best pet store.',        tier: 'TIER_2', openingTime: '08:00', closingTime: '19:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Pedigree Dog Food (1kg)',       description: 'Pedigree adult dry dog food — beef & chicken',         price: 4500, itemCategory: 'Dog Food',  imgKeyword: 'dog food kibble',       isFeatured: true },
        { name: 'Whiskas Cat Food (1.5kg)',      description: 'Whiskas adult dry cat food — ocean fish',              price: 5500, itemCategory: 'Cat Food',  imgKeyword: 'cat food bowl',         isFeatured: true },
        { name: 'Dog Collar & Leash Set',       description: 'Adjustable nylon collar with matching leash',          price: 3500, itemCategory: 'Accessories', imgKeyword: 'dog collar leash' },
        { name: 'Pet Shampoo (250ml)',           description: 'Gentle flea and tick dog/cat shampoo',                 price: 2500, itemCategory: 'Grooming',   imgKeyword: 'pet shampoo bottle' },
        { name: 'Squeaky Dog Toy Set',           description: 'Set of 3 rubber chew and squeaky toys',               price: 2800, itemCategory: 'Toys',       imgKeyword: 'dog toys rubber' },
        { name: 'Cat Litter (5kg)',              description: 'Clumping bentonite cat litter with odour control',    price: 4000, itemCategory: 'Cat Supplies', imgKeyword: 'cat litter clay' },
        { name: 'Pet Carrier Bag',              description: 'Foldable pet travel carrier for cats and small dogs',  price: 8500, itemCategory: 'Travel',     imgKeyword: 'pet carrier bag' },
        { name: 'Bird Seed Mix (1kg)',           description: 'Parrot and budgerigar seed blend',                    price: 2200, itemCategory: 'Bird Food',  imgKeyword: 'bird seed food' },
      ],
    },
    {
      name: 'Fashion & Clothing',
      coverKeyword: 'fashion clothing store african style',
      archetypes: [
        { nameTemplate: '{City} Fashion Hub',   descTemplate: 'Trendy outfits and accessories for {City}\'s style-conscious shoppers, delivered to you.', tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 40 },
        { nameTemplate: 'Style & Co {Code}',    descTemplate: 'Curated fashion pieces — from casual wear to Ankara — delivered across {City}.',           tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 45 },
        { nameTemplate: '{City} Wardrobe',      descTemplate: 'Your personal wardrobe delivered — quality clothing and shoes from {City}\'s best stores.', tier: 'TIER_2', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 38 },
        { nameTemplate: 'TrendSet {Code}',      descTemplate: 'Stay on trend — the latest fashion collections delivered fast to your {City} address.',    tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 42 },
        { nameTemplate: '{City} Boutique',      descTemplate: 'Exclusive boutique fashion — quality fabrics, modern cuts, delivered across {City}.',      tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 40 },
      ],
      menuTemplates: [
        { name: 'Ankara Print Set (Male)',      description: 'Tailored Ankara kaftan and trouser set — specify size',    price: 12000, itemCategory: 'African Wear',  imgKeyword: 'ankara african print fashion', isFeatured: true },
        { name: 'Ankara Dress (Female)',        description: 'A-line Ankara midi dress — various prints available',      price: 9500,  itemCategory: 'African Wear',  imgKeyword: 'ankara dress african',         isFeatured: true },
        { name: 'Plain T-Shirt (Unisex)',       description: '100% cotton crew neck tee — multiple colours',            price: 2500,  itemCategory: 'Casual Wear',   imgKeyword: 'plain t shirt fashion' },
        { name: 'Jogger Set (M/F)',             description: 'Cotton blend sweatsuit jogger set',                       price: 8500,  itemCategory: 'Casual Wear',   imgKeyword: 'jogger tracksuit set' },
        { name: 'Sneakers (Unisex)',            description: 'Chunky soled sneakers — sizes 36-45',                     price: 18000, itemCategory: 'Footwear',      imgKeyword: 'sneakers shoes fashion' },
        { name: 'Leather Handbag (Female)',     description: 'PU leather tote bag with zip compartments',              price: 14000, itemCategory: 'Bags',          imgKeyword: 'handbag leather fashion' },
        { name: 'Corporate Shirt (Male)',       description: 'Slim-fit cotton corporate shirt — multiple colours',       price: 6500,  itemCategory: 'Corporate',    imgKeyword: 'dress shirt corporate' },
        { name: 'Agbada Set (3-piece)',         description: 'Embroidered 3-piece agbada with inner set',              price: 35000, itemCategory: 'African Wear',  imgKeyword: 'agbada nigerian fashion' },
      ],
    },
    {
      name: 'Cookware & Appliances',
      coverKeyword: 'kitchen cookware pots pans appliances',
      archetypes: [
        { nameTemplate: '{City} Kitchen World',  descTemplate: 'Complete your kitchen — pots, pans, and appliances delivered across {City}.',             tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 45 },
        { nameTemplate: 'CookRight {Code}',      descTemplate: 'Quality cookware and kitchen tools for {City} cooks — from beginner to professional.',   tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 40 },
        { nameTemplate: '{City} Home Appliances', descTemplate: 'Small and large kitchen appliances delivered and installed across {City}.',               tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 50 },
        { nameTemplate: 'KitchenPro {Code}',     descTemplate: 'Professional-grade kitchen equipment for home cooks in {City} — cook like a chef.',       tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 42 },
        { nameTemplate: '{City} Cookware Depot',  descTemplate: 'Wholesale and retail cookware — the largest selection in {City} at unbeatable prices.',  tier: 'TIER_2', openingTime: '08:30', closingTime: '20:00', avgDeliveryTime: 45 },
      ],
      menuTemplates: [
        { name: 'Non-stick Pot Set (5-piece)',    description: 'Granite-coated non-stick pot and pan set',              price: 28000, itemCategory: 'Cookware',    imgKeyword: 'cooking pots pans set', isFeatured: true },
        { name: 'Standing Blender (700W)',        description: 'Powerful 700W blender with pulse function and 1.5L jug', price: 18000, itemCategory: 'Appliances', imgKeyword: 'blender kitchen appliance', isFeatured: true },
        { name: 'Electric Kettle (1.7L)',         description: '1.7L rapid-boil stainless steel electric kettle',       price: 9500,  itemCategory: 'Appliances', imgKeyword: 'electric kettle kitchen' },
        { name: 'Knife Set (5-piece)',            description: 'Stainless steel chef knife set with wooden block',       price: 12000, itemCategory: 'Cutlery',    imgKeyword: 'kitchen knife set' },
        { name: 'Toaster (2-slice)',             description: '850W 2-slot stainless steel toaster',                   price: 8500,  itemCategory: 'Appliances', imgKeyword: 'toaster kitchen' },
        { name: 'Pressure Cooker (6L)',          description: '6-litre stainless steel pressure cooker',               price: 22000, itemCategory: 'Cookware',   imgKeyword: 'pressure cooker stainless' },
        { name: 'Cast Iron Frying Pan (28cm)',   description: 'Pre-seasoned cast iron skillet, oven-safe',             price: 15000, itemCategory: 'Cookware',   imgKeyword: 'cast iron pan cooking' },
        { name: 'Air Fryer (3.5L)',              description: '1400W digital air fryer with timer and temperature control', price: 35000, itemCategory: 'Appliances', imgKeyword: 'air fryer kitchen' },
      ],
    },
    {
      name: 'Furniture & Décor',
      coverKeyword: 'furniture home decor interior design',
      archetypes: [
        { nameTemplate: '{City} Home Interiors',  descTemplate: 'Transform your living space — quality furniture and décor delivered across {City}.',      tier: 'TIER_2', openingTime: '08:00', closingTime: '19:00', avgDeliveryTime: 120 },
        { nameTemplate: 'DecorPlus {Code}',       descTemplate: 'Curated home décor and accent pieces for {City} homes — style that tells your story.',   tier: 'TIER_1', openingTime: '09:00', closingTime: '19:00', avgDeliveryTime: 90 },
        { nameTemplate: '{City} Furniture Gallery', descTemplate: 'Modern and classic furniture pieces delivered and assembled in {City}.',                 tier: 'TIER_2', openingTime: '08:00', closingTime: '18:00', avgDeliveryTime: 180 },
        { nameTemplate: 'HomeStyle {Code}',       descTemplate: 'Affordable quality furniture for every room — discover your style in {City}.',            tier: 'TIER_1', openingTime: '09:00', closingTime: '19:00', avgDeliveryTime: 120 },
        { nameTemplate: '{City} Living Space',    descTemplate: 'Sofa sets, beds, and décor pieces curated for {City}\'s most stylish homes.',            tier: 'TIER_2', openingTime: '08:30', closingTime: '19:00', avgDeliveryTime: 150 },
      ],
      menuTemplates: [
        { name: '3+2+1 Sofa Set',               description: 'Fabric L-shaped 3-2-1-seater sofa set with throw pillows', price: 185000, itemCategory: 'Living Room', imgKeyword: 'sofa set living room', isFeatured: true },
        { name: 'Bed Frame + Mattress (6×6)',    description: 'Platform bed frame with 10-inch orthopedic mattress',       price: 145000, itemCategory: 'Bedroom',    imgKeyword: 'bed frame mattress bedroom', isFeatured: true },
        { name: 'Dining Table Set (6-seater)',   description: 'Glass-top dining table with 6 padded chairs',               price: 95000,  itemCategory: 'Dining Room', imgKeyword: 'dining table chairs' },
        { name: 'Wall Mirror (120×60cm)',        description: 'Frameless full-length wall-mounted mirror',                  price: 22000,  itemCategory: 'Décor',      imgKeyword: 'wall mirror decor' },
        { name: 'Curtain Set (2 panels)',        description: 'Blackout curtain panels with header tape — specify colour', price: 18000,  itemCategory: 'Window',     imgKeyword: 'curtains window decor' },
        { name: 'Floor Rug (200×150cm)',         description: 'Shaggy or flatweave living room area rug',                  price: 35000,  itemCategory: 'Flooring',   imgKeyword: 'area rug carpet floor' },
        { name: 'TV Console (120cm)',            description: 'Modern floating TV unit with shelf — white or oak finish',   price: 55000,  itemCategory: 'Living Room', imgKeyword: 'tv console unit furniture' },
        { name: 'Ceiling Light (LED)',           description: 'Contemporary LED ceiling lamp with remote dimmer',           price: 28000,  itemCategory: 'Lighting',   imgKeyword: 'ceiling light led modern' },
      ],
    },
  ],

  // ── BEAUTY ──────────────────────────────────────────────────────────────────

  BEAUTY: [
    {
      name: 'Cosmetics',
      coverKeyword: 'cosmetics makeup beauty products store',
      archetypes: [
        { nameTemplate: '{City} Beauty Hub',     descTemplate: 'Premium and drugstore cosmetics delivered to beauty lovers across {City}.',               tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'Glam World {Code}',     descTemplate: 'Your glam destination in {City} — foundation, eyeshadow, lips, and more delivered.',     tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Makeup Store',   descTemplate: 'International makeup brands and local gems — beauty delivered in {City}.',                tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 28 },
        { nameTemplate: 'BeautyVault {Code}',    descTemplate: 'Curated cosmetics vault — only authentic products delivered to {City} beauties.',         tier: 'TIER_1', openingTime: '10:00', closingTime: '22:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Cosmetics Mall', descTemplate: 'A full cosmetics mall at your fingertips — every brand, every shade, in {City}.',        tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 30 },
      ],
      menuTemplates: [
        { name: 'Foundation (Fenty 30ml)',      description: 'Fenty Beauty Pro Filt\'r Soft Matte Foundation — 50 shades', price: 28000, itemCategory: 'Face',     imgKeyword: 'foundation makeup bottle', isFeatured: true },
        { name: 'Eyeshadow Palette (24-pan)',   description: '24-colour highly pigmented eyeshadow palette',               price: 12000, itemCategory: 'Eyes',     imgKeyword: 'eyeshadow palette makeup', isFeatured: true },
        { name: 'Matte Lipstick',              description: 'Long-wear matte lipstick — 20+ shades available',            price: 4500,  itemCategory: 'Lips',     imgKeyword: 'lipstick matte makeup' },
        { name: 'Setting Powder (25g)',         description: 'Translucent baking and setting powder',                       price: 8500,  itemCategory: 'Face',     imgKeyword: 'setting powder makeup' },
        { name: 'Mascara',                     description: 'Volumising and lengthening black mascara',                   price: 6500,  itemCategory: 'Eyes',     imgKeyword: 'mascara makeup eyes' },
        { name: 'Contour Kit',                 description: '3-shade contour and highlight palette',                      price: 9000,  itemCategory: 'Face',     imgKeyword: 'contour highlight makeup' },
        { name: 'Eyeliner Pencil (2-pack)',     description: 'Kohl kajal and liquid eyeliner set',                         price: 3500,  itemCategory: 'Eyes',     imgKeyword: 'eyeliner pencil makeup' },
        { name: 'Makeup Brush Set (12-piece)', description: 'Synthetic professional makeup brush set with pouch',         price: 11000, itemCategory: 'Tools',    imgKeyword: 'makeup brushes set' },
      ],
    },
    {
      name: 'Hair & Wigs',
      coverKeyword: 'hair wigs extensions braiding nigerian',
      archetypes: [
        { nameTemplate: '{City} Hair Boutique',  descTemplate: 'Premium human hair, wigs, and extensions delivered to {City}\'s most stylish women.',      tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: 'WigWorld {Code}',       descTemplate: 'The largest wig collection in {City} — lace front, full lace, and closures.',              tier: 'TIER_2', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} Hair Gallery',   descTemplate: 'Authentic human hair and quality wigs sourced directly — best prices in {City}.',          tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: 'LuxHair {Code}',        descTemplate: 'Luxury human hair and wigs for every occasion — delivered across {City}.',                 tier: 'TIER_2', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 32 },
        { nameTemplate: '{City} Tresses',        descTemplate: 'Your hair, your way — wigs, weaves, and braiding hair delivered in {City}.',              tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 30 },
      ],
      menuTemplates: [
        { name: 'Lace Front Wig (18")',          description: '13×4 human hair lace front wig, natural black',              price: 65000, itemCategory: 'Human Hair Wigs',  imgKeyword: 'lace front wig hair', isFeatured: true },
        { name: 'Closure Wig (16")',             description: '4×4 HD lace closure body wave wig',                          price: 45000, itemCategory: 'Human Hair Wigs',  imgKeyword: 'closure wig hair',    isFeatured: true },
        { name: 'Kinky Curly Weave (3 bundles)', description: '3 bundles 100% human hair kinky curly weave',               price: 38000, itemCategory: 'Weaves',           imgKeyword: 'curly hair weave' },
        { name: 'Straight Bundle Weave (3 pcs)', description: '3 bundles straight Brazilian or Peruvian hair',              price: 35000, itemCategory: 'Weaves',           imgKeyword: 'straight hair weave' },
        { name: 'Braiding Hair (pack × 3)',      description: 'Darling or Sleek braiding attachment hair — 3-pack',         price: 5500,  itemCategory: 'Braiding Hair',    imgKeyword: 'braiding hair extensions' },
        { name: 'Synthetic Wig (short)',         description: 'Heat-resistant fibre short curly synthetic wig',             price: 8500,  itemCategory: 'Synthetic Wigs',   imgKeyword: 'synthetic wig curly' },
        { name: 'Hair Bonding Glue',             description: 'Got2b Freeze Spray or Black Ice hair bonding glue',          price: 3500,  itemCategory: 'Hair Products',    imgKeyword: 'hair glue bonding' },
        { name: 'Edge Control (250g)',           description: 'Eco Styler or Ampro edge control for laid edges',            price: 2800,  itemCategory: 'Hair Products',    imgKeyword: 'edge control hair' },
      ],
    },
    {
      name: 'Skincare',
      coverKeyword: 'skincare beauty glow moisturizer serum',
      archetypes: [
        { nameTemplate: '{City} Glow Store',     descTemplate: 'Science-backed skincare for melanin-rich skin — delivered across {City}.',                tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'SkinFirst {Code}',      descTemplate: 'Authentic international and local skincare brands at your door in {City}.',                tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Skincare Hub',   descTemplate: 'Moisturisers, serums, and toners for every skin type — your {City} skincare destination.', tier: 'TIER_2', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'GlowUp {Code}',         descTemplate: 'Glow from within — premium skincare routines curated for {City}\'s skin types.',           tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Radiance Store', descTemplate: 'Beautiful, healthy skin starts here — skincare delivered fast across {City}.',             tier: 'TIER_2', openingTime: '09:30', closingTime: '21:00', avgDeliveryTime: 28 },
      ],
      menuTemplates: [
        { name: 'CeraVe Moisturising Cream (250g)', description: 'Daily face and body moisturiser with ceramides',        price: 12000, itemCategory: 'Moisturisers', imgKeyword: 'moisturizer cream skincare', isFeatured: true },
        { name: 'Niacinamide Serum 10% (30ml)',     description: 'Pore-refining niacinamide + zinc serum',               price: 9500,  itemCategory: 'Serums',       imgKeyword: 'serum skincare bottle',     isFeatured: true },
        { name: 'Vitamin C Serum (30ml)',           description: 'Brightening L-ascorbic acid vitamin C serum',          price: 11000, itemCategory: 'Serums',       imgKeyword: 'vitamin c serum skin' },
        { name: 'SPF 50 Sunscreen (75ml)',          description: 'Broad spectrum UVA/UVB protection daily sunscreen',    price: 8500,  itemCategory: 'Sunscreen',    imgKeyword: 'sunscreen spf skincare' },
        { name: 'Hyaluronic Acid Serum (30ml)',     description: 'Deep skin hydration hyaluronic acid serum',             price: 9000,  itemCategory: 'Serums',       imgKeyword: 'hyaluronic acid serum' },
        { name: 'Face Toner (200ml)',               description: 'AHA/BHA exfoliating and pore-tightening toner',        price: 7500,  itemCategory: 'Toners',       imgKeyword: 'toner face skincare' },
        { name: 'Eye Cream (15ml)',                description: 'Under-eye dark circle and puffiness cream',              price: 8000,  itemCategory: 'Eye Care',     imgKeyword: 'eye cream treatment' },
        { name: 'Retinol Night Cream (50ml)',       description: '0.5% retinol anti-ageing night moisturiser',           price: 14000, itemCategory: 'Anti-Ageing',  imgKeyword: 'retinol cream night' },
      ],
    },
    {
      name: 'Nail & Spa',
      coverKeyword: 'nail salon spa manicure pedicure',
      archetypes: [
        { nameTemplate: '{City} Nail Studio',   descTemplate: 'Nail polishes, gels, and spa products delivered to nail techs and enthusiasts in {City}.',  tier: 'TIER_1', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 20 },
        { nameTemplate: 'SpaBliss {Code}',      descTemplate: 'Relaxation at home — spa bath products and nail supplies delivered in {City}.',              tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 22 },
        { nameTemplate: '{City} Nail Palace',   descTemplate: 'Professional nail supplies and spa accessories for {City}\'s nail artisans.',                tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'NailPro {Code}',       descTemplate: 'Gel polish, acrylics, and spa products — the pro\'s choice in {City}.',                     tier: 'TIER_1', openingTime: '10:00', closingTime: '21:00', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Beauty Spa',    descTemplate: 'Spa-quality products for your home routine — bath, nails, and body care in {City}.',         tier: 'TIER_2', openingTime: '09:00', closingTime: '21:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Gel Polish Set (12 colours)',   description: 'UV gel nail polish collection — 12 trendy shades',           price: 15000, itemCategory: 'Gel Polish',    imgKeyword: 'gel nail polish set', isFeatured: true },
        { name: 'Acrylic Powder + Liquid Kit',  description: 'Professional acrylic nail extension starter kit',            price: 18000, itemCategory: 'Acrylics',     imgKeyword: 'acrylic nail kit',    isFeatured: true },
        { name: 'Nail Lamp (UV/LED, 48W)',       description: '48W dual UV/LED nail curing lamp with timer',                price: 12000, itemCategory: 'Equipment',    imgKeyword: 'nail uv lamp' },
        { name: 'Nail Tips (500-piece assorted)', description: 'Natural clear and white nail extension tips',               price: 3500,  itemCategory: 'Nail Tips',    imgKeyword: 'nail tips extensions' },
        { name: 'Cuticle Oil (30ml)',            description: 'Nourishing jojoba and vitamin E cuticle oil pen',           price: 2500,  itemCategory: 'Nail Care',    imgKeyword: 'cuticle oil nail care' },
        { name: 'Foot Spa Bath Kit',             description: 'Foot soak salts, pumice stone, and softening cream set',    price: 8500,  itemCategory: 'Spa',          imgKeyword: 'foot spa bath relax' },
        { name: 'Bath Bomb Set (8 pc)',          description: 'Lush-inspired bath bombs in assorted scents',               price: 7500,  itemCategory: 'Spa',          imgKeyword: 'bath bombs colorful' },
        { name: 'Nail Art Brush Set (20 pc)',    description: 'Fine liner and detail brushes for nail art',                price: 5500,  itemCategory: 'Nail Art',     imgKeyword: 'nail art brushes' },
      ],
    },
  ],

  // ── ERRAND ──────────────────────────────────────────────────────────────────

  ERRAND: [
    {
      name: 'Shopping Run',
      coverKeyword: 'shopping errand delivery service',
      archetypes: [
        { nameTemplate: '{City} ShopRunner',    descTemplate: 'We shop, you relax — send us to any market or store in {City} and get it delivered.',     tier: 'TIER_1', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 60 },
        { nameTemplate: 'QuickCart {Code}',     descTemplate: 'Your personal shopping assistant in {City} — tell us what you need and we get it.',        tier: 'TIER_1', openingTime: '08:00', closingTime: '19:00', avgDeliveryTime: 75 },
        { nameTemplate: '{City} Errand Express', descTemplate: 'Shopping errands done fast — markets, malls, and local stores across {City}.',            tier: 'TIER_2', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 55 },
        { nameTemplate: 'ShopFast {Code}',      descTemplate: 'Skip the queue, skip the traffic — we handle your {City} shopping, you relax.',            tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 65 },
        { nameTemplate: '{City} Market Runner',  descTemplate: 'Ariaria, Dugbe, Mile 12 — whatever market, we run errands for you across {City}.',        tier: 'TIER_2', openingTime: '06:00', closingTime: '19:00', avgDeliveryTime: 80 },
      ],
      menuTemplates: [
        { name: 'Market Shopping Run',        description: 'Send us to buy listed items from any {city} market',         price: 1500, itemCategory: 'Shopping',  imgKeyword: 'shopping market bag',         isFeatured: true },
        { name: 'Supermarket Run',            description: 'We shop your list from any supermarket in {city}',           price: 1200, itemCategory: 'Shopping',  imgKeyword: 'supermarket shopping cart',    isFeatured: true },
        { name: 'Pharmacy Pickup',            description: 'Collect prescribed or OTC medications from a pharmacy',      price: 1000, itemCategory: 'Pickup',    imgKeyword: 'pharmacy pickup errand' },
        { name: 'Food Takeaway Pickup',       description: 'Collect ordered food from a restaurant and deliver',         price: 1000, itemCategory: 'Pickup',    imgKeyword: 'takeaway food delivery' },
        { name: 'Grocery Bundle (hourly)',    description: 'Shopping service billed per hour in the market',            price: 2500, itemCategory: 'Shopping',  imgKeyword: 'grocery shopping errand' },
        { name: 'Boutique Shopping',          description: 'Shop clothes and shoes from boutiques and malls',           price: 1500, itemCategory: 'Shopping',  imgKeyword: 'boutique shopping clothes' },
        { name: 'Price Check Service',        description: 'We visit multiple stores and send you price comparisons',   price: 1000, itemCategory: 'Research',  imgKeyword: 'price comparison shopping' },
        { name: 'Bulk Buy (wholesale)',       description: 'We purchase in bulk from wholesalers on your behalf',       price: 3500, itemCategory: 'Wholesale', imgKeyword: 'wholesale bulk shopping' },
      ],
    },
    {
      name: 'Document Pickup',
      coverKeyword: 'document delivery courier office',
      archetypes: [
        { nameTemplate: '{City} DocRun',          descTemplate: 'Passport, bank documents, certificates — we collect any document in {City} for you.',       tier: 'TIER_1', openingTime: '07:00', closingTime: '18:00', avgDeliveryTime: 60 },
        { nameTemplate: 'PaperWork {Code}',       descTemplate: 'Official document collection and delivery — trusted by {City} professionals and families.',  tier: 'TIER_1', openingTime: '08:00', closingTime: '18:00', avgDeliveryTime: 70 },
        { nameTemplate: '{City} Document Services', descTemplate: 'Government offices, banks, schools — we retrieve your documents across {City}.',           tier: 'TIER_2', openingTime: '07:00', closingTime: '17:30', avgDeliveryTime: 90 },
        { nameTemplate: 'FileRunner {Code}',      descTemplate: 'Need a document picked up in {City}? We handle it fast and securely.',                       tier: 'TIER_1', openingTime: '08:00', closingTime: '18:00', avgDeliveryTime: 65 },
        { nameTemplate: '{City} Doc Delivery',    descTemplate: 'Secure document courier services within and across {City} — tracked and signed for.',        tier: 'TIER_2', openingTime: '07:30', closingTime: '18:00', avgDeliveryTime: 75 },
      ],
      menuTemplates: [
        { name: 'Bank Document Pickup',         description: 'Collect ATM card, statement, or bank letter',             price: 1500, itemCategory: 'Finance',     imgKeyword: 'bank document envelope',   isFeatured: true },
        { name: 'Government Office Pickup',     description: 'Collect NIN slip, WAEC cert, passport from any govt office', price: 2500, itemCategory: 'Government', imgKeyword: 'government office papers', isFeatured: true },
        { name: 'NYSC Document Pickup',         description: 'Collect call-up letter or certificate from NYSC office',  price: 2000, itemCategory: 'Government',  imgKeyword: 'nysc document certificate' },
        { name: 'University Document Pickup',   description: 'Transcripts, result slips, or letters from universities', price: 2000, itemCategory: 'Education',   imgKeyword: 'university certificate document' },
        { name: 'Legal Document Courier',       description: 'Signed agreements, affidavits, or court papers',         price: 3500, itemCategory: 'Legal',       imgKeyword: 'legal document papers' },
        { name: 'Parcel Delivery (intra-city)', description: 'Pick up a parcel from one address and deliver in-city',  price: 2000, itemCategory: 'Courier',     imgKeyword: 'parcel courier delivery' },
        { name: 'Letter Drop',                 description: 'Deliver a sealed letter or small envelope anywhere in city', price: 1000, itemCategory: 'Courier',   imgKeyword: 'letter envelope delivery' },
        { name: 'Same-Day Delivery',            description: 'Guaranteed same-day collection and delivery',             price: 3000, itemCategory: 'Express',     imgKeyword: 'same day delivery express' },
      ],
    },
    {
      name: 'Queue Agent',
      coverKeyword: 'queue waiting line service agent',
      archetypes: [
        { nameTemplate: '{City} Queue Pro',      descTemplate: 'Hate waiting in line? We stand in {City}\'s longest queues on your behalf.',                tier: 'TIER_1', openingTime: '07:00', closingTime: '17:00', avgDeliveryTime: 120 },
        { nameTemplate: 'LineSkip {Code}',       descTemplate: 'Queue busting service in {City} — banks, NIMC, passport offices, hospitals and more.',       tier: 'TIER_1', openingTime: '07:00', closingTime: '16:00', avgDeliveryTime: 150 },
        { nameTemplate: '{City} Queue Buster',   descTemplate: 'Send an agent to hold your spot in any {City} queue and call you when it\'s your turn.',    tier: 'TIER_2', openingTime: '06:30', closingTime: '17:00', avgDeliveryTime: 90 },
        { nameTemplate: 'QueueMate {Code}',      descTemplate: 'Time is money — let QueueMate handle all your {City} waiting so you don\'t have to.',        tier: 'TIER_1', openingTime: '07:00', closingTime: '17:00', avgDeliveryTime: 120 },
        { nameTemplate: '{City} Wait No More',   descTemplate: 'No more wasted hours — professional queue agents covering all government offices in {City}.', tier: 'TIER_2', openingTime: '06:00', closingTime: '17:30', avgDeliveryTime: 100 },
      ],
      menuTemplates: [
        { name: 'Bank Queue (2 hrs)',            description: 'Agent queues at your bank branch for up to 2 hours',     price: 2500, itemCategory: 'Finance',     imgKeyword: 'bank queue waiting line',  isFeatured: true },
        { name: 'NIMC/NIN Enrolment Queue',     description: 'Agent queues at NIMC centre for NIN registration',       price: 3000, itemCategory: 'Government',  imgKeyword: 'registration queue government', isFeatured: true },
        { name: 'Immigration/Passport Queue',   description: 'Agent queues at passport office on your behalf',         price: 4000, itemCategory: 'Government',  imgKeyword: 'passport office queue' },
        { name: 'Hospital Appointment Queue',   description: 'Hold your queue number at any hospital or clinic',       price: 2000, itemCategory: 'Health',      imgKeyword: 'hospital queue waiting' },
        { name: 'FRSC/Drivers Licence Queue',   description: 'Agent queues at FRSC for licence collection or renewal', price: 3500, itemCategory: 'Government',  imgKeyword: 'drivers license queue' },
        { name: 'JAMB/WAEC Office Queue',       description: 'Exam body offices — correction, transcript, or registration', price: 2500, itemCategory: 'Education', imgKeyword: 'exam office queue' },
        { name: 'Utility Bill Office Queue',    description: 'AEDC/EKEDC/IKEDC electricity office queue',              price: 2000, itemCategory: 'Utility',     imgKeyword: 'utility office bill' },
        { name: 'All-Day Queue Agent (6 hrs)',  description: 'Agent queues on your behalf for up to 6 hours at any office', price: 6000, itemCategory: 'Full Day', imgKeyword: 'full day queue agent service' },
      ],
    },
    {
      name: 'Delivery Agent',
      coverKeyword: 'delivery courier logistics motorcycle',
      archetypes: [
        { nameTemplate: '{City} Swift Delivery', descTemplate: 'Fast, reliable intra-city parcel and package delivery across {City} — same day.',           tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 45 },
        { nameTemplate: 'ParcelPro {Code}',      descTemplate: 'Professional last-mile delivery agents for individuals and businesses in {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 40 },
        { nameTemplate: '{City} Carry & Go',     descTemplate: 'Pick up and deliver anything in {City} — fast, tracked, and insured.',                      tier: 'TIER_1', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 50 },
        { nameTemplate: 'QuickDeliver {Code}',   descTemplate: 'Your {City} on-demand delivery partner — any item, anywhere in the city.',                  tier: 'TIER_2', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 42 },
        { nameTemplate: '{City} Express Logistics', descTemplate: 'Motorcycle and van logistics for {City} businesses and individuals — quick and reliable.', tier: 'TIER_2', openingTime: '06:00', closingTime: '22:00', avgDeliveryTime: 38 },
      ],
      menuTemplates: [
        { name: 'Envelope/Document Delivery',   description: 'Small envelope or document, within city',               price: 1000, itemCategory: 'Small Parcel', imgKeyword: 'envelope delivery courier',  isFeatured: true },
        { name: 'Small Parcel (under 5kg)',     description: 'Box or bag up to 5kg delivered within city',             price: 1500, itemCategory: 'Parcel',      imgKeyword: 'small parcel delivery',      isFeatured: true },
        { name: 'Medium Package (5-20kg)',      description: 'Package between 5-20kg for intra-city delivery',         price: 3000, itemCategory: 'Parcel',      imgKeyword: 'package delivery large' },
        { name: 'Fragile Item Delivery',        description: 'Careful handling for fragile or delicate items',         price: 2500, itemCategory: 'Specialised', imgKeyword: 'fragile delivery careful' },
        { name: 'Food Delivery Pickup',         description: 'Pick up food from restaurant and deliver — no platform', price: 1500, itemCategory: 'Food',        imgKeyword: 'food delivery motorcycle' },
        { name: 'Inter-State Dispatch',         description: 'Send packages to cities outside {City} via bus or transport', price: 5000, itemCategory: 'Inter-State', imgKeyword: 'interstate delivery logistics' },
        { name: 'Bulk Cargo (van, per trip)',   description: 'Van-load cargo or furniture move within city',           price: 15000, itemCategory: 'Cargo',      imgKeyword: 'van delivery cargo logistics' },
        { name: 'Express Delivery (30 min)',    description: 'Priority 30-minute delivery within 5km radius',          price: 3500, itemCategory: 'Express',     imgKeyword: 'express motorcycle delivery' },
      ],
    },
  ],
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function fill(template: string, city: CityConfig): string {
  return template
    .replace(/\{City\}/g, city.name)
    .replace(/\{Code\}/g, city.code);
}

// lat/lng offsets for up to 5 vendors in a subcategory
const COORD_OFFSETS = [
  [0.012,  0.010],
  [-0.008, 0.015],
  [0.005, -0.012],
  [-0.015, -0.007],
  [0.018, -0.018],
];

// ─── MAIN SEED ────────────────────────────────────────────────────────────────

async function seedBulk() {
  console.log('🌱 Starting GoBuyMe bulk seed...\n');

  const existing = await prisma.user.findFirst({
    where: { email: { endsWith: `@${BULK_DOMAIN}` } },
  });
  if (existing) {
    console.log(`⚠️  Bulk data already exists. Run \`npm run bulk:unseed\` first.`);
    return;
  }

  const password = await bcrypt.hash('Bulk@2026!', 12);

  let totalVendors = 0;

  const categories = Object.entries(SUBCATEGORIES) as [string, SubcategoryDef[]][];

  for (const city of CITIES) {
    console.log(`\n📍 Seeding ${city.name}...`);

    for (const [categoryKey, subcategoryDefs] of categories) {
      const categoryColor = CATEGORY_COLOR[categoryKey];

      for (let subIdx = 0; subIdx < subcategoryDefs.length; subIdx++) {
        const subDef = subcategoryDefs[subIdx];

        for (let archIdx = 0; archIdx < subDef.archetypes.length; archIdx++) {
          const archetype = subDef.archetypes[archIdx];
          const businessName = fill(archetype.nameTemplate, city);
          const slug = slugify(businessName);
          const email = `${slug}@${BULK_DOMAIN}`;
          const flatIndex = (CITIES.indexOf(city) * 28 * 5) + (subIdx * 5) + archIdx;
          const phone = `+2348${String(10000000 + flatIndex).substring(1)}`;

          const streetIdx = (subIdx + archIdx) % city.streets.length;
          const houseNo = (archIdx + 1) * 7;
          const address = `${houseNo} ${city.streets[streetIdx]}, ${city.name}`;

          const [latOff, lngOff] = COORD_OFFSETS[archIdx];
          const latitude  = parseFloat((city.lat + latOff + subIdx * 0.001).toFixed(6));
          const longitude = parseFloat((city.lng + lngOff + subIdx * 0.001).toFixed(6));

          const logoUrl  = avatar(businessName, categoryColor);
          const coverUrl = unsplash(1080, 580, subDef.coverKeyword);

          const tier = archetype.tier === 'TIER_2' ? CommissionTier.TIER_2 : CommissionTier.TIER_1;

          const userRecord = await prisma.user.create({
            data: {
              name: businessName,
              email,
              phone,
              password,
              role: Role.VENDOR,
              isEmailVerified: true,
              isActive: true,
              referralCode: `BLK${String(flatIndex).padStart(6, '0')}`,
              vendor: {
                create: {
                  businessName,
                  slug,
                  description: fill(archetype.descTemplate, city),
                  logo: logoUrl,
                  coverImage: coverUrl,
                  category: categoryKey as any,
                  subcategory: subDef.name,
                  address,
                  city: city.name,
                  state: city.state,
                  latitude,
                  longitude,
                  isOpen: true,
                  approvalStatus: ApprovalStatus.APPROVED,
                  commissionTier: tier,
                  openingTime: archetype.openingTime,
                  closingTime: archetype.closingTime,
                  avgDeliveryTime: archetype.avgDeliveryTime,
                },
              },
            },
            include: { vendor: true },
          });

          const vendor = userRecord.vendor!;

          await prisma.menuItem.createMany({
            data: subDef.menuTemplates.map((t, i) => ({
              vendorId: vendor.id,
              name: t.name,
              description: t.description,
              price: Math.round(t.price * (0.9 + archIdx * 0.05)),
              category: t.itemCategory,
              image: unsplash(400, 300, t.imgKeyword),
              isFeatured: t.isFeatured ?? false,
              isAvailable: true,
              stockQuantity: 999,
            })),
          });

          totalVendors++;
        }
      }
    }

    console.log(`  ✓ ${city.name} done`);
  }

  console.log(`\n✅ Bulk seed complete!`);
  console.log(`   Vendors created : ${totalVendors}`);
  console.log(`   Cities covered  : ${CITIES.length}`);
  console.log(`   Domain          : @${BULK_DOMAIN}`);
  console.log(`   Password        : Bulk@2026!`);
}

seedBulk()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
