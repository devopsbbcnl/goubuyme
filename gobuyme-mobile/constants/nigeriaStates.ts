// The 36 states plus the FCT. Canonical names match the backend (`backend/src/utils/nigeriaStates.ts`).
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

/** "Rivers State" / "Abuja" / "FCT" -> canonical state name, or null if it is not a Nigerian state. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = clean(raw);
  if (!key) return null;
  return ALIASES[key] ?? BY_KEY.get(key) ?? null;
}

export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeState(a);
  const y = normalizeState(b);
  return x !== null && x === y;
}
