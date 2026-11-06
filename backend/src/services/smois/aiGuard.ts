// Guard rails for AI answers (PRD 27.5). The model may only talk about numbers that are in the data it was given.
// Any figure in its reply that cannot be found there is surfaced to the reader instead of being trusted.

/** Every number appearing anywhere in a JSON value, including numbers written inside strings. */
export const factNumbers = (facts: unknown): number[] => {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string') for (const n of extractNumbers(v)) out.push(n.value);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(facts);
  return out;
};

export interface Claimed { raw: string; value: number; decimals: number }

/**
 * Numbers a reader would take as claims. Dates, years, clock times and list markers are not claims.
 * Handles 1,250  4.25%  ₦30,000  1.2k  2m.
 */
export const extractNumbers = (text: string): Claimed[] => {
  const cleaned = text
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, ' ')          // ISO dates
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi, ' ')       // clock times
    .replace(/\b(?:19|20)\d{2}\b(?![.,]\d)/g, ' ')                       // years
    .replace(/^\s*\d{1,2}[.)]\s+/gm, ' ');                              // list markers
  const out: Claimed[] = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?([kKmM](?![a-z]))?(%)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const intPart = m[1].replace(/,/g, '');
    const dec = m[2] ?? '';
    let value = Number(dec ? `${intPart}.${dec}` : intPart);
    if (m[3]) value *= /k/i.test(m[3]) ? 1_000 : 1_000_000;
    if (Number.isFinite(value)) out.push({ raw: m[0].trim(), value, decimals: m[3] ? 0 : dec.length });
  }
  return out;
};

const matches = (claimed: Claimed, fact: number): boolean => {
  const p = 10 ** claimed.decimals;
  return Math.round(fact * p) / p === claimed.value || Math.abs(fact - claimed.value) < 1e-9;
};

/** Figures in `text` that are not present (to the precision stated) in `facts`. */
export const verifyNumbers = (text: string, facts: unknown): { checked: number; unverified: string[] } => {
  const known = factNumbers(facts);
  const claims = extractNumbers(text);
  const unverified = claims.filter((c) => !known.some((f) => matches(c, f))).map((c) => c.raw);
  return { checked: claims.length, unverified: [...new Set(unverified)] };
};
