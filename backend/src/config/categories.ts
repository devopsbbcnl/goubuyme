export const EMART_CATEGORIES = [
  'Alcohol & Cigarettes',
  'Snacks',
  'Drinks',
  'Water',
  'Fruits & Vegetables',
  'Food',
  'Meat & Chicken',
  'Basic Food',
  'Dairy & Breakfast',
  'Bakery',
  'Ice Cream',
  'Fit & Form',
  'Home Care',
  'Home Life',
  'Personal Care',
  'Technology',
  'Sexual Health',
  'Baby',
  'Clothing',
  'Stationery',
  'Pets',
] as const;

export const PHARMACY_CATEGORIES = [
  'OTC Medications',
  'Vitamins & Supplements',
  'Prescription',
  'First Aid',
  'Mother & Baby',
  'Sexual Health',
  'Skincare',
  'Dental Care',
  'Eye Care',
  'Diagnostics & Monitoring',
  'Herbal & Natural',
  'Personal Hygiene',
] as const;

export const RESTAURANT_CATEGORIES = [
  'Meals',
  'Drinks',
  'Snacks',
  'Pastries',
  'Sides',
  'Desserts',
  'Specials',
  'Other',
] as const;

export const BAKERY_CATEGORIES = [
  'Cakes',
  'Bread',
  'Pastries',
  'Small Chops',
  'Pies & Rolls',
  'Doughnuts',
  'Cupcakes & Muffins',
  'Cookies & Biscuits',
  'Custom Orders',
  'Other',
] as const;

export const DRINKS_CATEGORIES = [
  'Soft Drinks',
  'Water',
  'Juices',
  'Energy Drinks',
  'Beer',
  'Wine',
  'Spirits',
  'Mixers & Cocktails',
  'Non-Alcoholic',
  'Other',
] as const;

export const BUTCHER_CATEGORIES = [
  'Beef',
  'Chicken',
  'Goat Meat',
  'Turkey',
  'Pork',
  'Fish',
  'Seafood',
  'Gizzard & Offals',
  'Processed Meat',
  'Other',
] as const;

export const GAS_CATEGORIES = [
  'Cooking Gas Refill',
  'Gas Cylinders',
  'Regulators & Hoses',
  'Burners & Cookers',
  'Accessories',
  'Other',
] as const;

export type EmartCategory = (typeof EMART_CATEGORIES)[number];
export type PharmacyCategory = (typeof PHARMACY_CATEGORIES)[number];
export type RestaurantCategory = (typeof RESTAURANT_CATEGORIES)[number];
export type BakeryCategory = (typeof BAKERY_CATEGORIES)[number];
export type DrinksCategory = (typeof DRINKS_CATEGORIES)[number];
export type ButcherCategory = (typeof BUTCHER_CATEGORIES)[number];
export type GasCategory = (typeof GAS_CATEGORIES)[number];

export const CATEGORIES_BY_VENDOR_TYPE: Record<string, readonly string[]> = {
  EMART: EMART_CATEGORIES,
  PHARMACY: PHARMACY_CATEGORIES,
  RESTAURANT: RESTAURANT_CATEGORIES,
  BAKERY: BAKERY_CATEGORIES,
  DRINKS: DRINKS_CATEGORIES,
  BUTCHER: BUTCHER_CATEGORIES,
  GAS: GAS_CATEGORIES,
};
