/**
 * Bulk seed â€” 11 cities Ã— 3 categories Ã— 5 subcategories Ã— 5 vendors = ~825 vendors.
 * All categories: RESTAURANT, EMART, PHARMACY.
 * Images sourced from Unsplash CDN (real photos, no API key required).
 * Logos generated via UI Avatars (initials-based brand logos).
 *
 * Run:   npm run bulk:seed
 * Wipe:  npm run bulk:unseed
 *
 * Password for every bulk account: Bulk@2026!
 */

import { PrismaClient, Role, VendorCategory, CommissionTier, ApprovalStatus, VerificationBadge } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BULK_DOMAIN = 'bulk.gobuyme.ng';

// â”€â”€â”€ CITIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ IMAGE HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const unsplash = (w: number, h: number, keyword: string) =>
  `https://picsum.photos/seed/${encodeURIComponent(keyword.replace(/\s+/g, '-'))}/${w}/${h}`;

const avatar = (name: string, color: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${color}&color=fff&size=200&bold=true&format=png`;

const CATEGORY_COLOR: Record<string, string> = {
  RESTAURANT: 'c0392b',
  EMART:      '27ae60',
  PHARMACY:   '2980b9',
};

// â”€â”€â”€ TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ SUBCATEGORY DATA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SUBCATEGORIES: Record<string, SubcategoryDef[]> = {

  // â”€â”€ RESTAURANT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  RESTAURANT: [
    {
      name: 'Local Buka',
      coverKeyword: 'nigerian food traditional cooking',
      archetypes: [
        { nameTemplate: 'Mama {City} Kitchen',       descTemplate: 'Authentic home-style {City} cooking â€” soups, swallows, and stews made fresh daily.',               tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Home Delicacies',    descTemplate: 'Traditional Nigerian meals served hot and fresh in the heart of {City}.',                           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'Iya Agba {Code} Buka',      descTemplate: "Grandma's recipes at your doorstep â€” the real taste of {City} home cooking.",                     tier: 'TIER_1', openingTime: '07:30', closingTime: '19:30', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Village Kitchen',    descTemplate: 'Farm-to-table Nigerian classics cooked the traditional way, delivered across {City}.',              tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 28 },
        { nameTemplate: 'Naija Taste {Code}',        descTemplate: 'Pure Nigerian buka experience â€” from ofe onugbu to egusi, served with love in {City}.',            tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 22 },
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
        { nameTemplate: '{City} Quick Bites',       descTemplate: 'Quick, delicious meals served fast â€” burgers, chicken, and more in {City}.',     tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Speed Eats {Code}',        descTemplate: 'Hot fast food delivered to your door in {City} â€” speed is our specialty.',         tier: 'TIER_1', openingTime: '09:00', closingTime: '23:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Chop Chop',         descTemplate: 'Fast Nigerian-inspired meals done right â€” tasty, affordable, and quick in {City}.', tier: 'TIER_1', openingTime: '08:30', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Fast N Fresh {Code}',      descTemplate: 'Freshly prepared fast food â€” no compromise on taste, no waiting long in {City}.',  tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 15 },
        { nameTemplate: '{City} Quickserve',        descTemplate: 'Your favourite fast food joint in {City} â€” burgers, wraps, fries, and more.',       tier: 'TIER_1', openingTime: '09:00', closingTime: '22:00', avgDeliveryTime: 20 },
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
        { nameTemplate: 'Flame & Spice {Code}', descTemplate: 'Open-flame grills, spiced to perfection â€” the best BBQ experience in {City}.',      tier: 'TIER_2', openingTime: '14:00', closingTime: '23:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} BBQ Palace',   descTemplate: 'From suya to asun â€” a full BBQ palace serving {City} with fire and flavour.',         tier: 'TIER_1', openingTime: '13:00', closingTime: '22:00', avgDeliveryTime: 25 },
        { nameTemplate: 'The Grill House {Code}', descTemplate: 'Expertly grilled meats and skewers delivered fresh to your door in {City}.',      tier: 'TIER_2', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 25 },
        { nameTemplate: '{City} Asun Joint',   descTemplate: 'Smoky peppered goat, suya, and assorted grills â€” the taste of {City} at night.',     tier: 'TIER_1', openingTime: '15:00', closingTime: '24:00', avgDeliveryTime: 35 },
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
        { nameTemplate: '{City} Shawarma Hub',   descTemplate: 'The best shawarma in {City} â€” loaded, saucy, and freshly rolled.',              tier: 'TIER_1', openingTime: '10:00', closingTime: '23:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Small Chops {Code}',    descTemplate: 'Puff puff, spring rolls, samosa â€” {City}\'s favourite small chops delivered.',  tier: 'TIER_1', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Wrap & Roll',    descTemplate: 'Wraps, shawarmas, and rolls made with fresh ingredients in {City}.',            tier: 'TIER_2', openingTime: '10:00', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Street Bites {Code}',   descTemplate: 'The best street snacks of {City} â€” freshly made and delivered to your door.',  tier: 'TIER_1', openingTime: '12:00', closingTime: '23:00', avgDeliveryTime: 15 },
        { nameTemplate: '{City} Snack Factory',  descTemplate: 'A one-stop snack shop for every craving in {City} â€” sweet, savoury, and spicy.', tier: 'TIER_2', openingTime: '09:00', closingTime: '22:00', avgDeliveryTime: 20 },
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
        { nameTemplate: 'The {City} Table',         descTemplate: 'An elevated dining experience in {City} â€” farm-fresh ingredients, chef-curated menus.',          tier: 'TIER_2', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 40 },
        { nameTemplate: '{City} Gourmet Kitchen',   descTemplate: 'Fine dining brought to your door â€” premium {City} ingredients prepared by expert chefs.',        tier: 'TIER_2', openingTime: '11:00', closingTime: '21:00', avgDeliveryTime: 45 },
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
        { name: 'CrÃ¨me BrÃ»lÃ©e',             description: 'Classic vanilla crÃ¨me brÃ»lÃ©e with caramelised top',    price: 3500, itemCategory: 'Desserts',    imgKeyword: 'creme brulee dessert' },
        { name: 'Chocolate Fondant',         description: 'Warm chocolate cake with molten centre and ice cream', price: 3800, itemCategory: 'Desserts',    imgKeyword: 'chocolate fondant dessert' },
      ],
    },
    {
      name: 'Chinese & Continental',
      coverKeyword: 'chinese food noodles continental restaurant',
      archetypes: [
        { nameTemplate: '{City} Dragon Palace',        descTemplate: 'Authentic Chinese cuisine delivered to your door in {City} â€” dim sum, noodles, and more.',           tier: 'TIER_2', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Orient Express {Code}',       descTemplate: 'East meets West â€” Chinese and continental favourites served fast in {City}.',                        tier: 'TIER_1', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Continental Kitchen',  descTemplate: 'A full continental menu featuring Chinese, Italian, and European classics in {City}.',               tier: 'TIER_2', openingTime: '11:00', closingTime: '21:00', avgDeliveryTime: 38 },
        { nameTemplate: 'Golden Wok {Code}',           descTemplate: 'Wok-tossed perfection â€” the best Chinese takeaway experience in {City}.',                           tier: 'TIER_1', openingTime: '12:00', closingTime: '22:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} International Cuisine', descTemplate: 'From Peking Duck to pasta â€” diverse international flavours delivered across {City}.',              tier: 'TIER_2', openingTime: '11:00', closingTime: '22:00', avgDeliveryTime: 35 },
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

  // â”€â”€ EMART â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  EMART: [
    {
      name: 'Supermarket',
      coverKeyword: 'supermarket grocery store shopping',
      archetypes: [
        { nameTemplate: '{City} Mart',              descTemplate: 'Your one-stop supermarket in {City} â€” groceries, household goods, and more delivered fast.',             tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: 'FreshZone {Code}',         descTemplate: 'A modern supermarket experience in {City} with thousands of products at your fingertips.',               tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} MegaStore',         descTemplate: 'The largest supermarket in {City} â€” everything you need, delivered to your home.',                       tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 40 },
        { nameTemplate: 'Big Value {Code}',         descTemplate: 'Unbeatable prices and quality â€” {City}\'s most affordable supermarket.',                                tier: 'TIER_1', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} SuperStore',        descTemplate: 'Premium grocery shopping made easy â€” wide range, great prices, delivered in {City}.',                   tier: 'TIER_2', openingTime: '07:30', closingTime: '22:00', avgDeliveryTime: 35 },
      ],
      menuTemplates: [
        { name: 'Golden Morn Cereal (500g)',   description: 'NestlÃ© Golden Morn maize cereal',                   price: 1800, itemCategory: 'Dairy & Breakfast', imgKeyword: 'cereal breakfast box', isFeatured: true },
        { name: 'Indomie Noodles (40-pack)',   description: 'Dangote Indomie instant noodles multipack',          price: 3200, itemCategory: 'Basic Food',        imgKeyword: 'instant noodles packet' },
        { name: 'Semovita (1kg)',              description: 'De Rica semolina for swallow',                       price: 1500, itemCategory: 'Basic Food',        imgKeyword: 'semolina flour bag' },
        { name: 'Chicken Seasoning Cubes (50)', description: 'Maggi or Knorr seasoning cubes',                  price: 800,  itemCategory: 'Food',              imgKeyword: 'seasoning cubes spice' },
        { name: 'Vegetable Oil (5 L)',         description: 'Kings or Power Oil vegetable oil',                   price: 6500, itemCategory: 'Food',              imgKeyword: 'vegetable oil bottle', isFeatured: true },
        { name: 'Tomato Paste (70g Ã— 10)',     description: 'Gino or Tomatina tomato purÃ©e sachets',             price: 1200, itemCategory: 'Food',              imgKeyword: 'tomato paste cans' },
        { name: 'Detergent Powder (1kg)',      description: 'Omo or Ariel washing powder',                       price: 2200, itemCategory: 'Home Care',         imgKeyword: 'laundry detergent' },
        { name: 'Toilet Rolls (12-pack)',      description: 'Soft 2-ply toilet tissue rolls',                    price: 2500, itemCategory: 'Home Care',         imgKeyword: 'toilet paper pack' },
      ],
    },
    {
      name: 'Fresh Produce',
      coverKeyword: 'fresh vegetables fruits market nigeria',
      archetypes: [
        { nameTemplate: '{City} Farm Fresh',    descTemplate: 'Direct from farms to your table â€” the freshest fruits and vegetables in {City}.',           tier: 'TIER_1', openingTime: '06:00', closingTime: '19:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Green Basket {Code}',  descTemplate: 'Seasonal, locally sourced produce delivered fresh daily across {City}.',                    tier: 'TIER_1', openingTime: '06:30', closingTime: '18:30', avgDeliveryTime: 22 },
        { nameTemplate: '{City} Market Direct', descTemplate: 'Market-fresh produce without the market hustle â€” delivered straight to {City} doors.',      tier: 'TIER_1', openingTime: '05:30', closingTime: '19:00', avgDeliveryTime: 25 },
        { nameTemplate: 'Fresh Picks {Code}',   descTemplate: 'Hand-picked daily from local farms â€” quality guaranteed, priced right in {City}.',          tier: 'TIER_2', openingTime: '06:00', closingTime: '18:00', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Veggie Hub',    descTemplate: 'Your neighbourhood fresh produce hub in {City} â€” greens, roots, and tropical fruits.',      tier: 'TIER_1', openingTime: '07:00', closingTime: '19:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Tomatoes (1kg)',           description: 'Ripe, fresh Roma tomatoes',                          price: 800,  itemCategory: 'Fruits & Vegetables', imgKeyword: 'fresh tomatoes market', isFeatured: true },
        { name: 'Tatashe (1kg)',            description: 'Fresh red bell peppers',                             price: 1000, itemCategory: 'Fruits & Vegetables', imgKeyword: 'red bell peppers fresh' },
        { name: 'Scotch Bonnet (500g)',     description: 'Fresh hot pepper (ata rodo)',                        price: 700,  itemCategory: 'Fruits & Vegetables', imgKeyword: 'scotch bonnet peppers' },
        { name: 'Ugu Leaf (bundle)',        description: 'Fresh fluted pumpkin leaves',                        price: 500,  itemCategory: 'Fruits & Vegetables', imgKeyword: 'pumpkin leaves green' },
        { name: 'Plantain (bunch of 7)',    description: 'Ripe and unripe plantain â€” specify preference',      price: 1800, itemCategory: 'Fruits & Vegetables', imgKeyword: 'plantain banana bunch', isFeatured: true },
        { name: 'Pineapple (medium)',       description: 'Sweet, ripe tropical pineapple',                    price: 1200, itemCategory: 'Fruits & Vegetables', imgKeyword: 'pineapple tropical fruit' },
        { name: 'Watermelon (whole)',       description: 'Juicy seedless watermelon',                         price: 2500, itemCategory: 'Fruits & Vegetables', imgKeyword: 'watermelon whole' },
        { name: 'Onions (3kg)',             description: 'Medium red onions â€” essential for every Nigerian kitchen', price: 1500, itemCategory: 'Fruits & Vegetables', imgKeyword: 'onions red market' },
      ],
    },
    {
      name: 'Packaged Foods',
      coverKeyword: 'packaged food dry goods grocery store',
      archetypes: [
        { nameTemplate: '{City} Pantry',         descTemplate: 'Stocking your pantry made easy â€” dry goods, canned foods, and provisions in {City}.',      tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: 'Pack & Stack {Code}',   descTemplate: 'Bulk or single â€” every packaged food item you need, delivered across {City}.',            tier: 'TIER_1', openingTime: '08:30', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Food Store',     descTemplate: 'Premium packaged foods and provisions sourced locally and internationally for {City}.',    tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 32 },
        { nameTemplate: 'Shelf Goods {Code}',    descTemplate: 'The best canned, bottled, and dry goods delivered to your {City} home without delay.',    tier: 'TIER_1', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Provisions',     descTemplate: 'Everything in a tin, pack, or bag â€” comprehensive provisions store serving {City}.',      tier: 'TIER_1', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Peak Milk Powder (900g)',      description: 'Peak full cream powdered milk',                      price: 5500, itemCategory: 'Dairy & Breakfast', imgKeyword: 'milk powder tin', isFeatured: true },
        { name: 'Milo Tin (400g)',              description: 'NestlÃ© Milo chocolate malt drink',                   price: 3200, itemCategory: 'Drinks',            imgKeyword: 'milo chocolate tin' },
        { name: 'Bournvita (500g)',             description: 'Cadbury Bournvita drinking chocolate',               price: 2800, itemCategory: 'Drinks',            imgKeyword: 'cocoa drink tin' },
        { name: 'Sardines (4-pack)',            description: 'Titus or Lucky Star canned sardines',               price: 2200, itemCategory: 'Food',               imgKeyword: 'sardine tin canned fish', isFeatured: true },
        { name: 'Corned Beef (200g)',           description: 'Grace or Bull\'s Head corned beef tin',             price: 1800, itemCategory: 'Food',               imgKeyword: 'corned beef canned' },
        { name: 'Rice (5kg)',                   description: 'Ofada or Royal Stallion parboiled rice',            price: 5000, itemCategory: 'Basic Food',         imgKeyword: 'rice bag grain' },
        { name: 'Spaghetti (5-pack Ã— 500g)',   description: 'Dangote or Honeywell spaghetti pasta',              price: 3500, itemCategory: 'Basic Food',         imgKeyword: 'spaghetti pasta dry' },
        { name: 'Groundnut Oil (2L)',           description: 'Gino or Devon King groundnut oil',                  price: 4500, itemCategory: 'Food',               imgKeyword: 'groundnut oil bottle' },
      ],
    },
    {
      name: 'Beverages & Drinks',
      coverKeyword: 'drinks beverages bottles juice',
      archetypes: [
        { nameTemplate: '{City} Drinks Hub',          descTemplate: 'Every beverage you crave â€” water, juice, soft drinks, and energy drinks in {City}.',   tier: 'TIER_1', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 20 },
        { nameTemplate: 'Sip & Quench {Code}',        descTemplate: 'Cold drinks, fresh juices, and bulk water delivery across {City}.',                   tier: 'TIER_1', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 18 },
        { nameTemplate: '{City} Beverage Store',      descTemplate: 'From chilled coke to fresh zobo â€” {City}\'s go-to drinks supplier.',                  tier: 'TIER_2', openingTime: '08:00', closingTime: '22:00', avgDeliveryTime: 22 },
        { nameTemplate: 'Liquid Gold {Code}',         descTemplate: 'Premium beverages and bulk drinks delivered cold and fast across {City}.',             tier: 'TIER_1', openingTime: '09:00', closingTime: '23:00', avgDeliveryTime: 20 },
        { nameTemplate: '{City} Refreshment Centre',  descTemplate: 'Your neighbourhood drinks stop â€” every brand, every size, delivered in {City}.',      tier: 'TIER_2', openingTime: '07:30', closingTime: '22:30', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Eva Water (6 Ã— 1.5L)',     description: 'Nigerian Eva table water 6-bottle pack',              price: 2500, itemCategory: 'Water',  imgKeyword: 'water bottles pack', isFeatured: true },
        { name: 'Coke (12-pack Ã— 35cl)',    description: 'Coca-Cola classic cans multipack',                    price: 4500, itemCategory: 'Drinks', imgKeyword: 'coca cola cans', isFeatured: true },
        { name: 'Fanta Orange (6 Ã— 50cl)', description: 'Fanta orange flavour glass bottles',                  price: 3000, itemCategory: 'Drinks', imgKeyword: 'fanta orange bottles' },
        { name: 'Malta Guinness (6-pack)',  description: 'Guinness Malta non-alcoholic malt drink',              price: 3600, itemCategory: 'Drinks', imgKeyword: 'malt drink bottles' },
        { name: 'Five Alive Juice (1L)',    description: 'Five Alive tropical citrus blend juice',              price: 1200, itemCategory: 'Drinks', imgKeyword: 'fruit juice carton' },
        { name: 'Zobo (2L)',               description: 'Fresh homemade hibiscus drink (zoborodo)',            price: 1500, itemCategory: 'Drinks', imgKeyword: 'hibiscus drink red' },
        { name: 'Power Horse (4-pack)',     description: 'Energy drink â€” Power Horse cans',                    price: 3200, itemCategory: 'Drinks', imgKeyword: 'energy drink cans' },
        { name: 'Lacasera (6-pack)',        description: 'Lacasera apple-flavoured sparkling drink',           price: 2800, itemCategory: 'Drinks', imgKeyword: 'apple soda drink' },
      ],
    },
    {
      name: 'Frozen Foods',
      coverKeyword: 'frozen food fish meat ice',
      archetypes: [
        { nameTemplate: '{City} Coldstore',     descTemplate: 'Fresh-frozen meats, fish, and ready meals delivered cold to {City} homes.',                tier: 'TIER_2', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Ice Chest {Code}',     descTemplate: 'Your trusted frozen foods supplier in {City} â€” quality cuts, right price.',                tier: 'TIER_1', openingTime: '07:00', closingTime: '19:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Frozen Depot',  descTemplate: 'Wholesale and retail frozen foods â€” poultry, seafood, and more across {City}.',            tier: 'TIER_2', openingTime: '06:00', closingTime: '19:00', avgDeliveryTime: 35 },
        { nameTemplate: 'Arctic Foods {Code}',  descTemplate: 'The coldest prices in {City} â€” premium frozen meats and fish delivered fast.',             tier: 'TIER_1', openingTime: '07:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} ChillBox',      descTemplate: 'Frozen to perfection â€” meats, seafood, and ice cream delivered across {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 32 },
      ],
      menuTemplates: [
        { name: 'Chicken (Whole, 1.5kg)',   description: 'Frozen whole broiler chicken, cleaned',                 price: 4500, itemCategory: 'Meat & Chicken', imgKeyword: 'whole chicken frozen', isFeatured: true },
        { name: 'Croaker Fish (1kg)',       description: 'Frozen Nigerian croaker fish (drum fish)',               price: 3500, itemCategory: 'Meat & Chicken', imgKeyword: 'croaker fish frozen',  isFeatured: true },
        { name: 'Beef (1kg, assorted)',     description: 'Mixed beef cuts â€” for stew, pepper soup, or barbecue',  price: 4000, itemCategory: 'Meat & Chicken', imgKeyword: 'beef cuts frozen' },
        { name: 'Prawn (500g)',             description: 'Frozen headless white prawns, cleaned',                 price: 4500, itemCategory: 'Meat & Chicken', imgKeyword: 'prawns frozen bag' },
        { name: 'Turkey Wings (1kg)',       description: 'Frozen smoked turkey wings',                           price: 5500, itemCategory: 'Meat & Chicken', imgKeyword: 'turkey wings frozen' },
        { name: 'Goat Meat (1kg)',          description: 'Frozen Nigerian goat meat, bone-in',                   price: 5000, itemCategory: 'Meat & Chicken', imgKeyword: 'goat meat raw' },
        { name: 'Ice Cream (1L)',           description: 'Fanmilk or Creambell vanilla / strawberry ice cream',  price: 2500, itemCategory: 'Ice Cream',      imgKeyword: 'ice cream tub' },
        { name: 'Sausage Roll (pack of 8)', description: 'Frozen ready-to-bake sausage rolls',                   price: 2200, itemCategory: 'Food',            imgKeyword: 'sausage rolls baked' },
      ],
    },
  ],

  // â”€â”€ PHARMACY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  PHARMACY: [
    {
      name: 'Medications',
      coverKeyword: 'pharmacy medicine pills drugstore',
      archetypes: [
        { nameTemplate: '{City} Pharmacy',          descTemplate: 'PCN-licensed pharmacy delivering genuine medications to your door in {City}.',         tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'MedPoint {Code}',          descTemplate: 'Authentic OTC and prescription medications dispensed safely across {City}.',           tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} HealthCare Pharmacy', descTemplate: 'Comprehensive pharmacy services â€” medication dispensing and health advice in {City}.', tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 22 },
        { nameTemplate: 'PharmaCare {Code}',        descTemplate: 'Certified pharmacists ensuring you get genuine drugs at the right dosage in {City}.',  tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Drug Store',        descTemplate: 'Your trusted community drug store â€” OTC medications delivered fast in {City}.',        tier: 'TIER_1', openingTime: '07:00', closingTime: '22:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Paracetamol 500mg (24 tabs)', description: 'Panadol or generic paracetamol pain relief',       price: 400,  itemCategory: 'Pain Relief',  imgKeyword: 'medicine pills white', isFeatured: true },
        { name: 'Amoxicillin 500mg (21 caps)', description: 'Broad-spectrum antibiotic â€” prescription required', price: 1800, itemCategory: 'Antibiotics', imgKeyword: 'antibiotic capsules' },
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
        { nameTemplate: '{City} Health Supplements', descTemplate: 'International-grade supplements at local prices â€” delivered across {City}.',            tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'NutriStore {Code}',        descTemplate: 'Sports nutrition, vitamins, and supplements for a healthier {City}.',                    tier: 'TIER_1', openingTime: '09:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Vitality Pharmacy', descTemplate: 'Fuel your health journey â€” quality supplements sourced from trusted brands in {City}.',  tier: 'TIER_2', openingTime: '08:00', closingTime: '21:00', avgDeliveryTime: 27 },
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
        { nameTemplate: '{City} BabyCare',          descTemplate: 'Everything for your baby and new mum â€” delivered safely across {City}.',                tier: 'TIER_2', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
        { nameTemplate: 'MamaPlus {Code}',          descTemplate: 'Maternal health and baby essentials from certified brands â€” trusted by {City} families.', tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 28 },
        { nameTemplate: '{City} Mother & Child',    descTemplate: 'Specialist maternal and infant health products for {City}\'s growing families.',         tier: 'TIER_2', openingTime: '07:30', closingTime: '21:00', avgDeliveryTime: 22 },
        { nameTemplate: 'TinyHearts {Code}',        descTemplate: 'Curated baby and maternal care products â€” from diapers to prenatal vitamins in {City}.',  tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Baby Essentials',   descTemplate: 'All your baby needs in one place â€” trusted brands delivered fast in {City}.',            tier: 'TIER_1', openingTime: '07:00', closingTime: '21:00', avgDeliveryTime: 25 },
      ],
      menuTemplates: [
        { name: 'Pampers Diapers (S/M/L, 50 pcs)', description: 'Pampers Active Baby diapers â€” pick size',          price: 7500, itemCategory: 'Diapers',     imgKeyword: 'baby diapers pampers', isFeatured: true },
        { name: 'NAN Infant Formula (400g)',        description: 'NestlÃ© NAN infant formula for 0-6 months',        price: 6500, itemCategory: 'Baby Formula', imgKeyword: 'baby formula tin',     isFeatured: true },
        { name: 'Aptamil Follow-On (400g)',         description: 'Aptamil stage 2 follow-on milk 6-12 months',      price: 7200, itemCategory: 'Baby Formula', imgKeyword: 'formula milk powder baby' },
        { name: 'Cerelac Wheat (1kg)',              description: 'NestlÃ© Cerelac wheat cereal for 6+ months',       price: 4500, itemCategory: 'Baby Food',    imgKeyword: 'baby cereal food' },
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
        { nameTemplate: '{City} MediTech',      descTemplate: 'Medical-grade devices for home health monitoring â€” delivered and demonstrated in {City}.',    tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: 'HealthGear {Code}',    descTemplate: 'NAFDAC-certified medical devices for {City} homes, clinics, and wellness centres.',           tier: 'TIER_1', openingTime: '09:00', closingTime: '19:00', avgDeliveryTime: 30 },
        { nameTemplate: '{City} Medical Supplies', descTemplate: 'Clinical and home-use medical supplies for {City} health professionals and families.',     tier: 'TIER_2', openingTime: '07:30', closingTime: '19:30', avgDeliveryTime: 32 },
        { nameTemplate: 'ProMed {Code}',        descTemplate: 'Professional-grade health monitoring equipment sold and delivered in {City}.',                tier: 'TIER_1', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 35 },
        { nameTemplate: '{City} Diagnostic Store', descTemplate: 'Diagnostic tools for home use â€” glucometers, BP monitors, and more in {City}.',           tier: 'TIER_2', openingTime: '08:00', closingTime: '20:00', avgDeliveryTime: 30 },
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
};

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ MAIN SEED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function seedBulk() {
  console.log('ðŸŒ± Starting GoBuyMe bulk seed...\n');

  const existing = await prisma.user.findFirst({
    where: { email: { endsWith: `@${BULK_DOMAIN}` } },
  });
  if (existing) {
    console.log(`âš ï¸  Bulk data already exists. Run \`npm run bulk:unseed\` first.`);
    return;
  }

  const password = await bcrypt.hash('Bulk@2026!', 12);

  let totalVendors = 0;

  const categories = Object.entries(SUBCATEGORIES) as [string, SubcategoryDef[]][];

  for (const city of CITIES) {
    console.log(`\nðŸ“ Seeding ${city.name}...`);

    for (const [categoryKey, subcategoryDefs] of categories) {
      const categoryColor = CATEGORY_COLOR[categoryKey];

      for (let subIdx = 0; subIdx < subcategoryDefs.length; subIdx++) {
        const subDef = subcategoryDefs[subIdx];

        for (let archIdx = 0; archIdx < subDef.archetypes.length; archIdx++) {
          const archetype = subDef.archetypes[archIdx];
          const businessName = fill(archetype.nameTemplate, city);
          const slug = slugify(businessName);
          const email = `${slug}@${BULK_DOMAIN}`;
          const phone = `+2348${String(1005000000 + totalVendors).substring(1)}`;

          const streetIdx = (subIdx + archIdx) % city.streets.length;
          const houseNo = (archIdx + 1) * 7;
          const address = `${houseNo} ${city.streets[streetIdx]}, ${city.name}`;

          const [latOff, lngOff] = COORD_OFFSETS[archIdx];
          const latitude  = parseFloat((city.lat + latOff + subIdx * 0.001).toFixed(6));
          const longitude = parseFloat((city.lng + lngOff + subIdx * 0.001).toFixed(6));

          const logoUrl  = avatar(businessName, categoryColor);
          const coverUrl = unsplash(1080, 580, subDef.coverKeyword);

          const tier = archetype.tier === 'TIER_2' ? CommissionTier.TIER_2 : CommissionTier.TIER_1;

          // ── Computed quality signals ─────────────────────────────────────
          // Rating: top-ranking archetype (archIdx 0) in each city scores higher;
          // TIER_2 vendors skew slightly higher; subIdx adds minor variation.
          const baseRating = 3.8 + archIdx * 0.1 + (tier === CommissionTier.TIER_2 ? 0.15 : 0) + subIdx * 0.02;
          const rating     = parseFloat(Math.min(5.0, baseRating).toFixed(1));
          const totalRatings = Math.round(12 + archIdx * 18 + subIdx * 6 + (tier === CommissionTier.TIER_2 ? 25 : 0));

          // Badge: TIER_2 vendors earn business/premium badges; TIER_1 earn ID or nothing.
          let verificationBadge: VerificationBadge;
          if (tier === CommissionTier.TIER_2) {
            verificationBadge = archIdx >= 3 ? VerificationBadge.PREMIUM_VERIFIED : VerificationBadge.BUSINESS_VERIFIED;
          } else {
            verificationBadge = archIdx >= 2 ? VerificationBadge.ID_VERIFIED : VerificationBadge.UNVERIFIED;
          }

          // Featured: first archetype of every TIER_2 subcategory is featured.
          const isFeaturedVendor = archIdx === 0 && tier === CommissionTier.TIER_2;
          const featuredUntil    = isFeaturedVendor ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
          const displayOrder     = isFeaturedVendor ? (subIdx + 1) : 0;

          const userRecord = await prisma.user.create({
            data: {
              name: businessName,
              email,
              phone,
              password,
              role: Role.VENDOR,
              isEmailVerified: true,
              isActive: true,
              referralCode: `BLK${String(totalVendors).padStart(6, '0')}`,
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
                  rating,
                  totalRatings,
                  verificationBadge,
                  isFeatured: isFeaturedVendor,
                  featuredUntil,
                  displayOrder,
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

    console.log(`  âœ“ ${city.name} done`);
  }

  console.log(`\nâœ… Bulk seed complete!`);
  console.log(`   Vendors created : ${totalVendors}`);
  console.log(`   Cities covered  : ${CITIES.length}`);
  console.log(`   Domain          : @${BULK_DOMAIN}`);
  console.log(`   Password        : Bulk@2026!`);
}

seedBulk()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
