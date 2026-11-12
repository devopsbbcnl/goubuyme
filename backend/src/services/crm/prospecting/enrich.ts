// Lead finder: reads a business's own public website for contact details. Fetches the home page
// and at most one contact/about page. Addresses come from a third party, so every hop is checked
// to be a public internet host before it is requested.
import dns from 'dns';
import net from 'net';
import axios from 'axios';
import { PageContacts, extractContacts } from './rules';

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'GoBuyMeLeadFinder/1.0 (+https://gobuyme.shop)';

/** True for loopback, private, link-local and other addresses that are not the public internet. */
export const isPrivateAddress = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
};

const assertPublic = async (url: URL): Promise<void> => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Not a web address');
  if (url.username || url.password) throw new Error('Address carries credentials');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Unusual port');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Not a public address');
    return;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) throw new Error('Not a public host');
  const addresses = await dns.promises.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error('Not a public address');
};

const fetchHtml = async (start: string): Promise<{ html: string; url: string } | null> => {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await axios.get<string>(url.toString(), {
      timeout: TIMEOUT_MS, maxRedirects: 0, responseType: 'text', maxContentLength: MAX_BYTES, validateStatus: () => true,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      transformResponse: (d) => d,
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(String(res.headers.location), url);
      continue;
    }
    if (res.status !== 200 || !/html/i.test(String(res.headers['content-type'] ?? ''))) return null;
    return { html: typeof res.data === 'string' ? res.data : '', url: url.toString() };
  }
  return null;
};

const merge = (a: PageContacts, b: PageContacts): PageContacts => ({
  emails: [...new Set([...a.emails, ...b.emails])].slice(0, 5),
  phones: [...new Set([...a.phones, ...b.phones])].slice(0, 5),
  whatsapp: a.whatsapp ?? b.whatsapp,
  instagram: a.instagram ?? b.instagram,
  facebook: a.facebook ?? b.facebook,
  contactPage: a.contactPage,
  mentionsDelivery: a.mentionsDelivery || b.mentionsDelivery,
  competitors: [...new Set([...a.competitors, ...b.competitors])],
  ordersViaChat: a.ordersViaChat || b.ordersViaChat,
});

/** Contact details from a business website, or null when it could not be read. Never throws. */
export const readWebsite = async (website: string): Promise<PageContacts | null> => {
  try {
    const home = await fetchHtml(website);
    if (!home) return null;
    let contacts = extractContacts(home.html, home.url);
    if (contacts.emails.length === 0 && contacts.contactPage) {
      const page = await fetchHtml(contacts.contactPage).catch(() => null);
      if (page) contacts = merge(contacts, extractContacts(page.html, page.url));
    }
    return contacts;
  } catch {
    return null;
  }
};

/** Runs `fn` over `items`, at most `limit` at a time, keeping order. */
export const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};
