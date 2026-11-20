// Lead outreach rules: what a broadcast to pipeline leads may send, and to whom. Pure functions
// (no database, no network) so they can be unit-tested; the delivery engine is leadBroadcast.service.ts.
//
//   smsSegments      how many SMS pages a message costs
//   composeLeadSms   the final text: brand prefix, personalised body, opt-out link
//   composeLeadEmail subject + footer facts the email must carry
//   skipReason       why a lead must NOT get a message on a channel (null = may send)
//   normalizeSocial  a profile link or @handle → one canonical profile URL

export type OutreachChannel = 'SMS' | 'EMAIL';

export const OUTREACH_CHANNELS: OutreachChannel[] = ['SMS', 'EMAIL'];
export const STOP_CODE_LENGTH = 10;
export const LEAD_LIMITS = { name: 120, smsBody: 240, emailBody: 1500, emailSubject: 120, maxSmsPages: 2 };

// ─── SMS length ──────────────────────────────────────────────────────────────

// The GSM 03.38 basic set plus its extension table (each extension char costs two).
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(''),
);
const GSM_EXTENDED = new Set('^{}\\[~]|€'.split(''));

/** Pages a message occupies: 160/153 characters when it is plain GSM text, 70/67 once it holds emoji or accents outside GSM. */
export const smsSegments = (text: string): { pages: number; length: number; unicode: boolean } => {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.has(ch)) units += 1;
    else if (GSM_EXTENDED.has(ch)) units += 2;
    else { unicode = true; break; }
  }
  if (unicode) {
    const length = text.length; // UTF-16 code units, which is how a unicode SMS is counted
    return { pages: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67), length, unicode };
  }
  return { pages: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), length: units, unicode };
};

// ─── Personalisation and composing ───────────────────────────────────────────

export interface LeadNames { name: string; contactName: string | null }

const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';

/** {{name}} = the contact's first name, else the business name; {{business}} = the business name. */
export const personalizeLead = (text: string, lead: LeadNames): string => {
  const person = firstWord(lead.contactName ?? '');
  const business = lead.name.trim().slice(0, 40);
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, () => (person || business || 'there').slice(0, 40))
    .replace(/\{\{\s*business\s*\}\}/gi, () => business || 'your business');
};

/** Link shown in messages. No scheme: shorter, and phones still make it tappable. */
export const stopLink = (clientUrl: string, code: string) =>
  `${clientUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}/stop/${code}`;

export const composeLeadSms = (body: string, lead: LeadNames, link: string): string =>
  `GoBuyMe: ${personalizeLead(body.trim(), lead)} Opt out: ${link}`;

/** Longest a {{name}} / {{business}} can grow to, used to check a template before anyone sends it. */
const WORST_CASE_LEAD: LeadNames = { name: 'N'.repeat(40), contactName: null };

/** Validates a template against the page limit using worst-case names. Returns an error message or null. */
export const smsTemplateProblem = (body: string, clientUrl: string): string | null => {
  const text = body.trim();
  if (!text) return 'Write the SMS message.';
  if (text.length > LEAD_LIMITS.smsBody) return `The SMS must be ${LEAD_LIMITS.smsBody} characters or fewer.`;
  const sample = composeLeadSms(text, WORST_CASE_LEAD, stopLink(clientUrl, 'X'.repeat(STOP_CODE_LENGTH)));
  const { pages } = smsSegments(sample);
  if (pages > LEAD_LIMITS.maxSmsPages) {
    return `With the sender name and opt-out link added, this would use ${pages} SMS pages. Shorten it to ${LEAD_LIMITS.maxSmsPages} or fewer (emoji and accents make messages longer).`;
  }
  return null;
};

// ─── Who may be messaged ─────────────────────────────────────────────────────

/** A Nigerian mobile as its last 10 digits (7/8/9 then 0/1). Landlines cannot receive SMS. */
export const isMobileKey = (key: string | null): boolean => Boolean(key && /^[789][01]\d{8}$/.test(key));

export interface SendableLead {
  id: string;
  marketingOptOut: boolean;
  convertedUserId: string | null;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
}

export interface SkipContext {
  /** `${channel}:${key}` for every suppressed phone/email. */
  suppressed: Set<string>;
  /** Lead ids messaged within the frequency window. */
  recentlyMessaged: Set<string>;
}

export const suppressionKey = (channel: OutreachChannel, key: string) => `${channel}:${key}`;

/** Why this lead must not be messaged on this channel right now, or null when it may be. */
export const skipReason = (lead: SendableLead, channel: OutreachChannel, ctx: SkipContext): string | null => {
  if (lead.marketingOptOut) return 'Opted out';
  if (lead.convertedUserId) return 'Already has a GoBuyMe account';
  if (channel === 'SMS') {
    if (!lead.phone || !lead.phoneKey) return 'No phone number';
    if (!isMobileKey(lead.phoneKey)) return 'Not a mobile number';
    if (ctx.suppressed.has(suppressionKey('SMS', lead.phoneKey))) return 'Opted out';
  } else {
    if (!lead.email) return 'No email';
    if (ctx.suppressed.has(suppressionKey('EMAIL', lead.email.toLowerCase()))) return 'Opted out';
  }
  if (ctx.recentlyMessaged.has(lead.id)) return 'Messaged recently';
  return null;
};

/** Counts how many leads each skip reason removed, for the preview. */
export const tallyReasons = (reasons: Array<string | null>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of reasons) if (r) out[r] = (out[r] ?? 0) + 1;
  return out;
};

// ─── Social profiles (recorded and opened by staff; never broadcast to) ──────

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'twitter', 'youtube'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const HANDLE = /^[A-Za-z0-9_.]{2,30}$/;

/**
 * A profile link or "@handle" → the canonical https profile URL, or null when it is not a profile
 * (a post, a share button, a search page, another site). Missing stays null, never guessed.
 */
export const normalizeSocial = (platform: SocialPlatform, input: string | null | undefined): string | null => {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  // "@name", or a plain word with no dot (a dotted word is more likely a domain than a handle).
  if (/^@[A-Za-z0-9_.]{2,30}$/.test(raw) || /^[A-Za-z0-9_]{2,30}$/.test(raw)) {
    // Facebook pages and YouTube channels are not reliably addressed by a bare name.
    if (platform === 'facebook' || platform === 'youtube') return null;
    const h = raw.replace(/^@/, '');
    if (!HANDLE.test(h)) return null;
    return profileUrl(platform, h);
  }

  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';

  switch (platform) {
    case 'instagram': {
      if (host !== 'instagram.com' || !HANDLE.test(first)) return null;
      if (['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv'].includes(first.toLowerCase())) return null;
      return profileUrl('instagram', first);
    }
    case 'tiktok': {
      if (host !== 'tiktok.com' || !first.startsWith('@')) return null;
      const h = first.slice(1);
      return HANDLE.test(h) ? profileUrl('tiktok', h) : null;
    }
    case 'twitter': {
      if (host !== 'x.com' && host !== 'twitter.com') return null;
      if (!HANDLE.test(first) || ['share', 'intent', 'home', 'search', 'i', 'hashtag'].includes(first.toLowerCase())) return null;
      return profileUrl('twitter', first);
    }
    case 'facebook': {
      if (host !== 'facebook.com' && host !== 'fb.com') return null;
      if (!first || ['sharer', 'sharer.php', 'share', 'dialog', 'plugins', 'tr', 'login', 'groups', 'events', 'watch', 'marketplace'].includes(first.toLowerCase())) return null;
      if (first === 'profile.php') {
        const id = url.searchParams.get('id');
        return id && /^\d{5,20}$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
      }
      return /^[A-Za-z0-9_.\-]{2,80}$/.test(first) ? `https://www.facebook.com/${first}` : null;
    }
    case 'youtube': {
      if (host !== 'youtube.com') return null;
      if (first.startsWith('@') && HANDLE.test(first.slice(1))) return `https://www.youtube.com/${first}`;
      if (['channel', 'c', 'user'].includes(first) && /^[A-Za-z0-9_\-]{2,60}$/.test(parts[1] ?? '')) return `https://www.youtube.com/${first}/${parts[1]}`;
      return null;
    }
  }
};

const profileUrl = (platform: SocialPlatform, handle: string): string => {
  switch (platform) {
    case 'instagram': return `https://www.instagram.com/${handle}`;
    case 'tiktok': return `https://www.tiktok.com/@${handle}`;
    case 'twitter': return `https://x.com/${handle}`;
    case 'facebook': return `https://www.facebook.com/${handle}`;
    case 'youtube': return `https://www.youtube.com/@${handle}`;
  }
};
