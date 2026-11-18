import { Prisma } from '@prisma/client';

// The 36 states plus the FCT. Canonical names match what the apps show and what vendors/addresses
// store ("FCT" rather than "Abuja" / "Federal Capital Territory").
export const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
] as const;

const ALIASES: Record<string, string> = {
  fct: 'FCT',
  abuja: 'FCT',
  'abuja fct': 'FCT',
  'fct abuja': 'FCT',
  'federal capital territory': 'FCT',
  'federal capital territory abuja': 'FCT',
  akwaibom: 'Akwa Ibom',
  'cross-river': 'Cross River',
  crossriver: 'Cross River',
  nassarawa: 'Nasarawa',
};

const clean = (s: string) =>
  s.toLowerCase().replace(/\bstate\b/g, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

const BY_KEY = new Map<string, string>(NIGERIA_STATES.map((s) => [clean(s), s]));

/** Map free text ("rivers state", "Abuja", "FCT") to the canonical state name, or null if unknown. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = clean(raw);
  if (!key) return null;
  return ALIASES[key] ?? BY_KEY.get(key) ?? null;
}

/** Every spelling stored for a state, so legacy rows ("Abuja", "Rivers State") still match. */
function spellings(canonical: string): string[] {
  const out = new Set<string>([canonical, `${canonical} State`]);
  for (const [alias, target] of Object.entries(ALIASES)) if (target === canonical) out.add(alias);
  if (canonical === 'FCT') out.add('Federal Capital Territory').add('Abuja');
  return [...out];
}

/** Prisma filter for `Vendor.state`. Unknown input matches nothing rather than everything. */
export function vendorStateFilter(raw: string | undefined | null): Prisma.VendorWhereInput {
  if (!raw) return {};
  const canonical = normalizeState(raw);
  if (!canonical) return { id: '__no_such_state__' };
  return { OR: spellings(canonical).map((s) => ({ state: { equals: s, mode: 'insensitive' as const } })) };
}

/** Two stored state strings refer to the same state. */
export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeState(a);
  const y = normalizeState(b);
  return x !== null && x === y;
}
