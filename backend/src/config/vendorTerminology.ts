import { CATEGORIES_BY_VENDOR_TYPE, RESTAURANT_CATEGORIES } from './categories';

/**
 * Per-vendor-category naming. Single source of truth for the mobile, web and
 * admin apps — they read it from the vendor payload instead of hardcoding "Menu".
 */
export interface VendorTerminology {
  /** What the vendor calls their catalogue, e.g. "Menu", "Products". */
  section: string;
  /** Singular label for one entry, e.g. "Menu item", "Product". */
  item: string;
  /** Plural label for many entries. */
  itemPlural: string;
  /** What customers see on the storefront (may differ from the vendor-facing name). */
  customerSection: string;
  /** Label for the per-item category tag field. */
  tagLabel: string;
}

const PRODUCTS = { section: 'Products', item: 'Product', itemPlural: 'Products', customerSection: 'Products' };

export const TERMINOLOGY_BY_VENDOR_TYPE: Record<string, VendorTerminology> = {
  RESTAURANT: { section: 'Menu', item: 'Menu item', itemPlural: 'Menu items', customerSection: 'Menu', tagLabel: 'Meal type' },
  EMART: { ...PRODUCTS, tagLabel: 'Aisle' },
  PHARMACY: { section: 'Inventory', item: 'Product', itemPlural: 'Products', customerSection: 'Products', tagLabel: 'Type' },
  BAKERY: { ...PRODUCTS, tagLabel: 'Category' },
  DRINKS: { section: 'Beverages', item: 'Beverage', itemPlural: 'Beverages', customerSection: 'Beverages', tagLabel: 'Category' },
  BUTCHER: { ...PRODUCTS, tagLabel: 'Cut type' },
  GAS: { ...PRODUCTS, tagLabel: 'Category' },
};

/** Terminology + allowed category tags for a vendor category (falls back to restaurant). */
export function getVendorVocabulary(category: string | null | undefined) {
  const key = category && TERMINOLOGY_BY_VENDOR_TYPE[category] ? category : 'RESTAURANT';
  return {
    terminology: TERMINOLOGY_BY_VENDOR_TYPE[key],
    categoryTags: CATEGORIES_BY_VENDOR_TYPE[key] ?? RESTAURANT_CATEGORIES,
  };
}
