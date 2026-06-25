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

export type EmartCategory = (typeof EMART_CATEGORIES)[number];
export type PharmacyCategory = (typeof PHARMACY_CATEGORIES)[number];
export type RestaurantCategory = (typeof RESTAURANT_CATEGORIES)[number];

export const CATEGORIES_BY_VENDOR_TYPE: Record<string, readonly string[]> = {
  EMART: EMART_CATEGORIES,
  PHARMACY: PHARMACY_CATEGORIES,
  RESTAURANT: RESTAURANT_CATEGORIES,
};
