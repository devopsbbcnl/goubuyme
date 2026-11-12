// Lead finder: the pure rules. No database, no network, so every rule here is unit-tested.
//   interpretQuery   what a plain-language request means (category, place, thresholds)
//   categoryFor      which of our vendor categories a found business belongs to
//   extractContacts  emails, phones, WhatsApp and social links from a web page
//   scoreProspect    the fit score and the reasons behind it
//   buildDrafts      the standard first-contact messages
// A value a source did not give stays null. Nothing here guesses a contact detail.
import { VendorCategory } from '@prisma/client';

// ─── Understanding the request ───────────────────────────────────────────────

const CATEGORY_WORDS: Array<[VendorCategory, RegExp]> = [
  // Order matters: more specific trades first, so "cake shop" is a bakery, not an e-mart.
  ['PHARMACY', /\b(pharmac(y|ies)|chemists?|drug ?stores?)\b/i],
  ['BAKERY', /\b(baker(y|ies)|cakes?|bread|pastr(y|ies)|confectioner(y|ies))\b/i],
  ['BUTCHER', /\b(butchers?|butcher(y|ies)|meat shops?|meat|abattoirs?|frozen foods?)\b/i],
  ['GAS', /\b(cooking gas|gas (plants?|refill|stations?|shops?|vendors?|dealers?)|lpg|gas)\b/i],
  ['DRINKS', /\b(drinks?|wines?|liquor|spirits|beverages?|juice|smoothies?|bars?)\b/i],
  ['EMART', /\b(super ?markets?|grocer(y|ies)|mini ?marts?|marts?|provisions?|convenience stores?|stores?)\b/i],
  ['RESTAURANT', /\b(restaurants?|eater(y|ies)|food|kitchens?|bukas?|bukka|grills?|fast food|shawarma|pizza|cafes?|caf[eé]s?|canteens?|suya|amala)\b/i],
];

/** Cities we recognise at the end of a place phrase ("Wuse 2 Abuja" → area Wuse 2, city Abuja). */
export const KNOWN_CITIES = [
  'Port Harcourt', 'Lagos', 'Abuja', 'Ibadan', 'Kano', 'Enugu', 'Benin City', 'Benin', 'Uyo', 'Calabar', 'Owerri', 'Warri',
  'Aba', 'Kaduna', 'Jos', 'Abeokuta', 'Ilorin', 'Asaba', 'Onitsha', 'Yenagoa', 'Akure', 'Awka', 'Umuahia', 'Lokoja', 'Makurdi',
  'Osogbo', 'Ado Ekiti', 'Abakaliki', 'Minna', 'Sokoto', 'Maiduguri', 'Bauchi', 'Yola', 'Ikeja', 'Lekki',
];

export interface Criteria {
  category: VendorCategory | null;
  city: string | null;
  area: string | null;
  minRating: number | null;
  minReviews: number | null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export const categoryFromText = (text: string): VendorCategory | null =>
  CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;

/** Splits "Wuse 2 Abuja" or "GRA Phase 2, Port Harcourt" into area and city. */
export const splitPlace = (phrase: string): { city: string | null; area: string | null } => {
  const clean = phrase.replace(/\s+/g, ' ').replace(/[.,\s]+$/, '').replace(/,?\s*nigeria$/i, '').trim();
  if (!clean) return { city: null, area: null };
  if (clean.includes(',')) {
    const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
    const city = parts[parts.length - 1];
    return { city: titleCase(city), area: parts.length > 1 ? titleCase(parts.slice(0, -1).join(', ')) : null };
  }
  const lower = clean.toLowerCase();
  const city = [...KNOWN_CITIES].sort((a, b) => b.length - a.length).find((c) => lower === c.toLowerCase() || lower.endsWith(` ${c.toLowerCase()}`));
  if (city) {
    const area = clean.slice(0, clean.length - city.length).trim();
    return { city, area: area ? titleCase(area) : null };
  }
  return { city: titleCase(clean), area: null };
};

/** Reads category, place and thresholds out of a request like "pharmacies in Wuse 2 Abuja with 50+ reviews". */
export const interpretQuery = (text: string): Criteria => {
  const q = text.replace(/\s+/g, ' ').trim();

  const reviews = q.match(/(?:at least|over|more than|minimum of|min\.?)\s*(\d{1,6})\s*reviews?/i) ?? q.match(/(\d{1,6})\s*\+?\s*(?:or more\s*)?reviews?/i);
  const rating =
    q.match(/(?:rated|rating(?: of)?|ratings?)\s*(?:at least|above|over|of)?\s*([1-5](?:\.\d)?)\s*\+?/i) ??
    q.match(/([1-5](?:\.\d)?)\s*\+?\s*(?:stars?|star rating)/i);

  // The place is whatever follows "in / around / near", up to the first threshold clause.
  const place = q.match(/\b(?:in|around|near|within)\s+(.+?)(?=\s+(?:with|that|which|who|having|rated|rating|and\s+(?:with|at least|over|rated))\b|$)/i);
  const { city, area } = place ? splitPlace(place[1]) : { city: null, area: null };

  // Look for the category in the part before the place, so "food in Meat Market Road" is a restaurant.
  const subject = place ? q.slice(0, place.index) : q;
  const minRating = rating ? Number(rating[1]) : null;
  return {
    category: categoryFromText(subject) ?? categoryFromText(q),
    city,
    area,
    minRating: minRating !== null && minRating >= 1 && minRating <= 5 ? minRating : null,
    minReviews: reviews ? Number(reviews[1]) : null,
  };
};

// ─── Category of a found business ────────────────────────────────────────────

const TYPE_CATEGORY: Array<[VendorCategory, RegExp]> = [
  ['PHARMACY', /^(pharmacy|drugstore)$/],
  ['BAKERY', /^(bakery|pastry_shop|cake_shop|confectionery|dessert_shop|donut_shop)$/],
  ['BUTCHER', /^butcher_shop$/],
  ['DRINKS', /^(liquor_store|bar|wine_bar|pub|juice_shop)$/],
  ['EMART', /^(supermarket|grocery_store|convenience_store|market|asian_grocery_store|food_store|wholesaler)$/],
  ['RESTAURANT', /(^|_)restaurant$|^(meal_takeaway|meal_delivery|cafe|coffee_shop|food_court|fast_food|sandwich_shop|diner|cafeteria)$/],
];

/** Our vendor category for a business, from the provider's types, then from its name. Null when unclear. */
export const categoryFor = (types: string[], primaryType: string | null, name: string): VendorCategory | null => {
  const ordered = [...(primaryType ? [primaryType] : []), ...types];
  for (const t of ordered) {
    const hit = TYPE_CATEGORY.find(([, re]) => re.test(t));
    if (hit) return hit[0];
  }
  // A petrol station is not a cooking-gas vendor, whatever its name says.
  if (ordered.includes('gas_station')) return null;
  return categoryFromText(name);
};

// ─── Reading a web page ──────────────────────────────────────────────────────

export const COMPETITORS: Array<[string, RegExp]> = [
  ['Chowdeck', /chowdeck/i],
  ['Glovo', /glovo/i],
  ['HeyFood', /hey ?food/i],
  ['Jumia Food', /jumia\s*food|food\.jumia/i],
  ['Bolt Food', /bolt\s*food|food\.bolt/i],
  ['Mano', /\bmano\.(ng|africa)|\bmano app\b/i],
];

export interface PageContacts {
  emails: string[];
  phones: string[];
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  contactPage: string | null;
  mentionsDelivery: boolean;
  competitors: string[];
  ordersViaChat: boolean;
}

const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|yourdomain|sentry|wixpress|sentry-next)\.|^(you|name|email|user|your)@|@\dx\./i;

const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** Nigerian mobile or landline as written on a page → the digits, or null if it is not a plausible number. */
export const cleanPhone = (raw: string): string | null => {
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const m = digits.match(/^(?:\+?234|0)([789][01]\d{8}|[1-9]\d{6,8})$/);
  if (!m) return null;
  return digits.startsWith('0') ? digits : `+${digits.replace(/^\+/, '')}`;
};

/** wa.me expects the international number without "+". */
export const waNumber = (phone: string): string => phone.replace(/\D/g, '').replace(/^0/, '234');

const decode = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/** Pulls contact details and delivery signals out of a page's HTML. */
export const extractContacts = (html: string, baseUrl: string): PageContacts => {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].replace(/&amp;/g, '&').trim());
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#64;|&commat;/g, '@')
    .replace(/\s+/g, ' ');

  const emails = unique([
    ...hrefs.filter((h) => /^mailto:/i.test(h)).map((h) => decode(h.slice(7).split('?')[0])),
    ...(text.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? []),
  ].map((e) => e.trim().toLowerCase().replace(/[.,;:]+$/, '')))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !JUNK_EMAIL.test(e) && e.length <= 100);

  const phones = unique([
    ...hrefs.filter((h) => /^tel:/i.test(h)).map((h) => decode(h.slice(4))),
    ...(text.match(/(?:\+?234|\b0)[\s\-.()]*[789][\s\-.()]*[01](?:[\s\-.()]*\d){8}\b/g) ?? []),
  ].map(cleanPhone).filter((p): p is string => Boolean(p)));

  let whatsapp: string | null = null;
  for (const h of hrefs) {
    const m = h.match(/(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:.*&)?phone=)\+?(\d{10,15})/i);
    if (m) { whatsapp = cleanPhone(`+${m[1]}`) ?? `+${m[1]}`; break; }
  }

  const social = (re: RegExp) => {
    for (const h of hrefs) {
      const m = h.match(re);
      if (m) return m[0].replace(/^http:/i, 'https:').replace(/\/$/, '');
    }
    return null;
  };
  const instagram = social(/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/|stories\/)[A-Za-z0-9_.]{2,30}/i);
  const facebook = social(/https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|login)[A-Za-z0-9_.\-/]{2,80}/i);

  let contactPage: string | null = null;
  try {
    const base = new URL(baseUrl);
    for (const h of hrefs) {
      if (!/contact|about|reach-us|get-in-touch/i.test(h) || /^(mailto|tel|javascript|#)/i.test(h)) continue;
      const u = new URL(h, base);
      if (u.host === base.host && u.pathname !== base.pathname) { u.hash = ''; contactPage = u.toString(); break; }
    }
  } catch { /* unparseable base: no contact page */ }

  const haystack = `${text} ${hrefs.join(' ')}`;
  return {
    emails: emails.slice(0, 5),
    phones: phones.slice(0, 5),
    whatsapp,
    instagram,
    facebook,
    contactPage,
    mentionsDelivery: /\b(deliver(y|ies|ed|s|ing)?|dispatch rider|doorstep)\b/i.test(text),
    competitors: COMPETITORS.filter(([, re]) => re.test(haystack)).map(([name]) => name),
    ordersViaChat: Boolean(whatsapp) && /\border(s|ing)?\b/i.test(text),
  };
};

/** The best address to write to: one on the business's own domain first, then the first found. */
export const pickEmail = (emails: string[], website: string | null): string | null => {
  if (!emails.length) return null;
  let host = '';
  try { host = website ? new URL(website).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { /* keep '' */ }
  return (host && emails.find((e) => e.endsWith(`@${host}`))) || emails[0];
};

export type LinkKind ='instagram' | 'facebook' | 'whatsapp' | 'site';

/** Many small businesses list a social profile as their "website". Those are recorded, not fetched. */
export const linkKind = (url: string): LinkKind => {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'site'; }
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(facebook|fb)\.com$/.test(host)) return 'facebook';
  if (host === 'wa.me' || /(^|\.)whatsapp\.com$/.test(host)) return 'whatsapp';
  return 'site';
};

// ─── Fit score ───────────────────────────────────────────────────────────────

export interface Signals {
  /** From the places provider. Null = not recorded. */
  offersDelivery: boolean | null;
  mentionsDelivery: boolean;
  competitors: string[];
  ordersViaChat: boolean;
  websiteRead: boolean;
}

export interface ScoreInput {
  category: VendorCategory | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  businessStatus: string | null;
  signals: Signals;
}

export interface FitReason { label: string; points: number }

const CATEGORY_LABEL: Record<VendorCategory, string> = {
  RESTAURANT: 'Restaurant', EMART: 'E-mart', PHARMACY: 'Pharmacy', BAKERY: 'Bakery', DRINKS: 'Drinks', BUTCHER: 'Butcher', GAS: 'Gas',
};

/**
 * Fit score out of 100: category 20, location 10, popularity 30, delivery readiness 25, reachable 15.
 * Reasons with 0 points are kept so staff can see what was missing, not only what counted.
 */
export const scoreProspect = (p: ScoreInput, target: { city: string | null }): { score: number; reasons: FitReason[] } => {
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') {
    return { score: 0, reasons: [{ label: p.businessStatus === 'CLOSED_PERMANENTLY' ? 'Closed permanently' : 'Temporarily closed', points: 0 }] };
  }
  const reasons: FitReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });

  add(p.category ? `${CATEGORY_LABEL[p.category]}: a category we serve` : 'Category unclear', p.category ? 20 : 0);

  if (target.city) {
    const where = `${p.city ?? ''} ${p.address ?? ''}`.toLowerCase();
    const inCity = where.includes(target.city.toLowerCase());
    add(inCity ? `In ${target.city}` : `Not clearly in ${target.city}`, inCity ? 10 : 0);
  }

  if (p.rating === null) add('Rating not recorded', 0);
  else add(`Rated ${p.rating.toFixed(1)}`, p.rating >= 4.5 ? 15 : p.rating >= 4 ? 12 : p.rating >= 3.5 ? 6 : 0);
  if (p.reviewCount === null) add('Review count not recorded', 0);
  else add(`${p.reviewCount.toLocaleString('en-NG')} review${p.reviewCount === 1 ? '' : 's'}`, p.reviewCount >= 200 ? 15 : p.reviewCount >= 50 ? 11 : p.reviewCount >= 10 ? 6 : p.reviewCount >= 1 ? 2 : 0);

  const s = p.signals;
  if (s.offersDelivery === true || s.mentionsDelivery) add(s.offersDelivery === true ? 'Listed as offering delivery' : 'Website mentions delivery', 10);
  if (s.competitors.length) add(`Already on ${s.competitors.join(', ')}`, 10);
  if (s.ordersViaChat || p.whatsapp) add(s.ordersViaChat ? 'Takes orders on WhatsApp' : 'Has a WhatsApp number', 5);

  add(p.phone ? 'Phone number found' : 'No phone number found', p.phone ? 10 : 0);
  add(p.email ? 'Email found' : 'No email found', p.email ? 5 : 0);

  return { score: Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)), reasons };
};

// ─── Matching businesses we already know ─────────────────────────────────────

/** Name reduced for comparison: lower case, no punctuation, no company suffixes. */
export const normalizeName = (name: string): string =>
  name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(ltd|limited|nig|nigeria|enterprises?|ventures?|and sons|plc|co|company|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

export interface KnownVendor { id: string; name: string; city: string | null; phoneKey: string | null; email: string | null }

/** The vendor already on GoBuyMe that this business is, if any: same phone, same email, or same name in the same city. */
export const matchVendor = (
  p: { name: string; city: string | null; address: string | null; phoneKeys: string[]; emails: string[] },
  vendors: KnownVendor[],
): KnownVendor | null => {
  const name = normalizeName(p.name);
  const where = `${p.city ?? ''} ${p.address ?? ''}`.toLowerCase();
  return vendors.find((v) =>
    (v.phoneKey && p.phoneKeys.includes(v.phoneKey)) ||
    (v.email && p.emails.includes(v.email.toLowerCase())) ||
    (name.length >= 4 && normalizeName(v.name) === name && Boolean(v.city) && where.includes(v.city!.toLowerCase())),
  ) ?? null;
};

// ─── First-contact messages ──────────────────────────────────────────────────

export interface Drafts {
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  callScript: string;
}

export interface DraftContext {
  senderName: string;
  commissionPercent: number;
  signupUrl: string;
}

const CATEGORY_NOUN: Record<VendorCategory, string> = {
  RESTAURANT: 'restaurants', EMART: 'supermarkets and shops', PHARMACY: 'pharmacies', BAKERY: 'bakeries', DRINKS: 'drinks shops',
  BUTCHER: 'butchers', GAS: 'cooking gas vendors',
};

/** Standard messages built only from facts we hold about the business. Staff edit and send them themselves. */
export const buildDrafts = (
  p: { name: string; category: VendorCategory | null; city: string | null; area: string | null; rating: number | null; reviewCount: number | null; signals: Pick<Signals, 'competitors'> | null },
  ctx: DraftContext,
): Drafts => {
  // A shared login such as "GoBuyMe Admin" is not a person's name: speak as the team instead.
  const firstWord = ctx.senderName.trim().split(/\s+/)[0] ?? '';
  const named = Boolean(firstWord) && !/^(gobuyme|admin|support|operations|ops|team|super)$/i.test(firstWord);
  const who = named ? `${firstWord} from GoBuyMe` : 'the GoBuyMe team';
  const place = p.area ?? p.city;
  const peers = p.category ? CATEGORY_NOUN[p.category] : 'local businesses';
  const pct = Number.isInteger(ctx.commissionPercent) ? String(ctx.commissionPercent) : ctx.commissionPercent.toFixed(1);
  const praise = p.rating !== null && p.rating >= 4 && p.reviewCount !== null && p.reviewCount >= 10
    ? `Your ${p.rating.toFixed(1)} rating from ${p.reviewCount.toLocaleString('en-NG')} Google reviews stood out. `
    : '';
  const onOthers = p.signals?.competitors.length ? `You can keep using ${p.signals.competitors.join(' and ')} and add us alongside. ` : '';
  const offer = `GoBuyMe is a delivery app${place ? ` serving ${place}` : ''}. We bring you orders, our riders deliver them, and commission starts at ${pct}% with no sign-up fee.`;

  return {
    whatsapp:
      `Hello, this is ${who}. I found ${p.name} on Google. ${praise}${offer} ${onOthers}` +
      `Would you be open to listing ${p.name} with us? It takes a few minutes: ${ctx.signupUrl}\n\n` +
      `If you would rather not hear from us, reply STOP and I will not message again.`,
    emailSubject: `Listing ${p.name} on GoBuyMe`,
    emailBody:
      `Hello,\n\n${named ? `My name is ${firstWord} and I work with GoBuyMe` : 'I am writing from GoBuyMe'}. I found ${p.name} on Google and wanted to reach out. ${praise}\n\n` +
      `${offer} We are signing up ${peers}${place ? ` in ${place}` : ''} now. ${onOthers}\n\n` +
      `You can register here: ${ctx.signupUrl}\nOr reply to this email and I will call you to walk you through it.\n\n` +
      `If this is not of interest, reply to say so and we will not contact you again.\n\nThank you,\n${named ? `${ctx.senderName.trim()}\nGoBuyMe` : 'The GoBuyMe team'}`,
    callScript: [
      `Greet and confirm you are speaking to the owner or manager of ${p.name}.`,
      `Say who you are: ${who}, a delivery app${place ? ` serving ${place}` : ''}. Say you found them on Google.`,
      praise ? `Mention their ${p.rating!.toFixed(1)} rating from ${p.reviewCount!.toLocaleString('en-NG')} reviews.` : null,
      `Ask how they handle delivery orders today${p.signals?.competitors.length ? ` (they are on ${p.signals.competitors.join(', ')})` : ''}.`,
      `Offer: we bring orders, our riders deliver, commission starts at ${pct}%, no sign-up fee.`,
      `Next step: send the sign-up link on WhatsApp (${ctx.signupUrl}) or book a visit.`,
      'If they are not interested, thank them, mark the lead as lost and do not call again.',
    ].filter(Boolean).map((line, i) => `${i + 1}. ${line}`).join('\n'),
  };
};

/** Pure: a rewrite is kept only if the facts that must not change are still there. */
export const rewriteIsFaithful = (rewritten: Drafts, standard: Drafts, ctx: DraftContext): boolean => {
  const pct = `${Number.isInteger(ctx.commissionPercent) ? ctx.commissionPercent : ctx.commissionPercent.toFixed(1)}%`;
  const figures = (s: string) => new Set(s.replace(ctx.signupUrl, ' ').match(/\d+(?:[.,]\d+)*%?/g) ?? []);
  const allowed = new Set([...figures(standard.whatsapp), ...figures(standard.emailBody), ...figures(standard.callScript)]);
  const noNewFigures = (s: string, list: boolean) => [...figures(s)].every((f) => allowed.has(f) || (list && /^\d$/.test(f)));
  return (
    rewritten.whatsapp.includes(ctx.signupUrl) && rewritten.emailBody.includes(ctx.signupUrl) &&
    rewritten.whatsapp.includes(pct) && rewritten.emailBody.includes(pct) &&
    noNewFigures(rewritten.whatsapp, false) && noNewFigures(rewritten.emailBody, false) && noNewFigures(rewritten.callScript, true) &&
    rewritten.whatsapp.length <= 1200 && rewritten.emailBody.length <= 2500 && rewritten.callScript.length <= 2500
  );
};

// ─── Scheduling ──────────────────────────────────────────────────────────────

export const nextRunAfter = (schedule: 'NONE' | 'DAILY' | 'WEEKLY', from: Date): Date | null =>
  schedule === 'NONE' ? null : new Date(from.getTime() + (schedule === 'DAILY' ? 1 : 7) * 86_400_000);
