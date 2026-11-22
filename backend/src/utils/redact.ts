/**
 * Removes personal data from text and objects before they are stored as error logs, written to log files,
 * or sent to third parties (Anthropic for error analysis, Telegram for alerts). NDPA register G8.
 *
 * It is a safety net, not a licence to log personal data: callers should still avoid putting phone numbers,
 * emails or identity numbers into error messages and context in the first place.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// Nigerian mobile numbers (0803..., 234803..., +234803...) and other international numbers (+ then 10-14 digits).
const NG_PHONE = /(?<![\d])(?:\+?234|0)[789][01]\d{8}(?![\d])/g;
const INTL_PHONE = /\+\d[\d\s-]{8,16}\d/g;
// Identity, account and card numbers: 10 or more digits in a row.
const LONG_DIGITS = /(?<![\w-])\d{10,}(?![\w-])/g;
// secret=..., password: "...", token=... in free text.
const SECRET_PAIR = /\b(password|passwd|secret|token|apikey|api_key|authorization|otp|pin|cvv)\b(\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&}]+)/gi;

const SENSITIVE_KEY = /pass(word|wd)?|secret|token|authorization|cookie|otp|pin\b|cvv|nin\b|bvn|account(number|no)|card|signature/i;
const CONTACT_KEY = /^(to|email|phone|mobile|msisdn|recipient|address|name|fullname|customername)$/i;

export function redactText(input: string | null | undefined): string | undefined {
  if (input === null || input === undefined) return undefined;
  return String(input)
    .replace(JWT, '[token]')
    .replace(BEARER, '$1 [token]')
    .replace(SECRET_PAIR, (_m, k: string, sep: string) => `${k}${sep}[redacted]`)
    .replace(EMAIL, '[email]')
    .replace(NG_PHONE, '[phone]')
    .replace(INTL_PHONE, '[phone]')
    .replace(LONG_DIGITS, '[number]');
}

/** Redacts every string inside an object/array (to a depth limit) and blanks values under sensitive or contact keys. */
export function redactDeep<T>(value: T, depth = 0): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[truncated]' as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k) || CONTACT_KEY.test(k)) out[k] = v === null || v === undefined ? v : '[redacted]';
    else out[k] = redactDeep(v, depth + 1);
  }
  return out as T;
}

/** Strips the query string and fragment from a URL (they can carry tokens and emails) and redacts the rest. */
export function redactUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return redactText(url.split('?')[0].split('#')[0]);
}
