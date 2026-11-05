// Mirrors backend/src/config/vendorTerminology.ts — the API sends the real values
// on the vendor payload; this is only the fallback while it loads or if it's missing.
export interface VendorTerminology {
	section: string;
	item: string;
	itemPlural: string;
	customerSection: string;
	tagLabel: string;
}

export const DEFAULT_TERMINOLOGY: VendorTerminology = {
	section: 'Menu',
	item: 'Menu item',
	itemPlural: 'Menu items',
	customerSection: 'Menu',
	tagLabel: 'Category',
};

export const DEFAULT_CATEGORY_TAGS: string[] = ['Meals', 'Drinks', 'Snacks', 'Pastries', 'Sides', 'Desserts', 'Specials', 'Other'];
