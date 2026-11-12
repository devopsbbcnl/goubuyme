import {
  Signals, buildDrafts, categoryFor, cleanPhone, extractContacts, interpretQuery, linkKind, matchVendor, nextRunAfter, normalizeName,
  pickEmail, rewriteIsFaithful, scoreProspect, splitPlace, waNumber,
} from '../rules';
import { isPrivateAddress } from '../enrich';
import { fromGoogle, maxCallsFor } from '../places';

const noSignals: Signals = { offersDelivery: null, mentionsDelivery: false, competitors: [], ordersViaChat: false, websiteRead: false };

describe('interpretQuery', () => {
  it('reads category, area, city and both thresholds from one sentence', () => {
    expect(interpretQuery('pharmacies in Wuse 2 Abuja with 50+ reviews rated 4.2+')).toEqual({
      category: 'PHARMACY', city: 'Abuja', area: 'Wuse 2', minRating: 4.2, minReviews: 50,
    });
  });

  it('handles a comma-separated place and a multi-word city', () => {
    expect(interpretQuery('Restaurants in GRA Phase 2, Port Harcourt')).toMatchObject({ category: 'RESTAURANT', city: 'Port Harcourt', area: 'Gra Phase 2' });
    expect(interpretQuery('bakeries around Rumuola Port Harcourt')).toMatchObject({ category: 'BAKERY', city: 'Port Harcourt', area: 'Rumuola' });
  });

  it('leaves what was not said as null', () => {
    expect(interpretQuery('supermarkets')).toEqual({ category: 'EMART', city: null, area: null, minRating: null, minReviews: null });
    expect(interpretQuery('anything in Uyo')).toMatchObject({ category: null, city: 'Uyo', minReviews: null });
  });

  it('takes the category from the subject, not from a word inside the place name', () => {
    expect(interpretQuery('food in Meat Market Road Aba').category).toBe('RESTAURANT');
  });

  it('understands other threshold phrasings and ignores impossible ratings', () => {
    expect(interpretQuery('cooking gas vendors in Lagos with at least 20 reviews')).toMatchObject({ category: 'GAS', city: 'Lagos', minReviews: 20 });
    expect(interpretQuery('butchers in Enugu with 4 stars').minRating).toBe(4);
    expect(interpretQuery('wine shops in Lekki rated 9').minRating).toBeNull();
  });

  it('splitPlace treats an unknown single phrase as the city', () => {
    expect(splitPlace('Nnewi')).toEqual({ city: 'Nnewi', area: null });
    expect(splitPlace('')).toEqual({ city: null, area: null });
  });
});

describe('categoryFor', () => {
  it('prefers the provider primary type, then other types, then the name', () => {
    expect(categoryFor(['store', 'food'], 'pharmacy', 'Health Plus')).toBe('PHARMACY');
    expect(categoryFor(['nigerian_restaurant', 'food'], null, 'Bole King')).toBe('RESTAURANT');
    expect(categoryFor(['store'], null, 'Chidi Cooking Gas Depot')).toBe('GAS');
  });

  it('never calls a petrol station a cooking-gas vendor, and stays null when unclear', () => {
    expect(categoryFor(['gas_station'], 'gas_station', 'Total Gas Station')).toBeNull();
    expect(categoryFor(['point_of_interest'], null, 'Emeka and Sons')).toBeNull();
  });
});

describe('extractContacts', () => {
  const html = `
    <html><head><style>.a{color:red}</style><script>var e="tracker@sentry.io"</script></head><body>
      <a href="mailto:Orders@MamaPut.ng?subject=Hi">Email us</a> or info@mamaput.ng. Logo: hero@2x.png
      <a href="tel:+234 803 123 4567">Call</a> Also 0802-555-1234 and 12345.
      <a href="https://wa.me/2348031234567?text=I%20want%20to%20order">Order on WhatsApp</a>
      <a href="https://www.instagram.com/mamaput_ph/">IG</a> <a href="https://instagram.com/p/abc123">post</a>
      <a href="https://facebook.com/sharer/sharer.php?u=x">share</a> <a href="https://web.facebook.com/mamaputph">FB</a>
      <a href="/contact-us#form">Contact</a>
      We offer home delivery. Find us on Chowdeck and Glovo.
    </body></html>`;
  const c = extractContacts(html, 'https://mamaput.ng/');

  it('finds real emails and drops asset names and tracker addresses', () => {
    expect(c.emails).toEqual(['orders@mamaput.ng', 'info@mamaput.ng']);
  });

  it('finds Nigerian numbers from links and text, and nothing shorter', () => {
    expect(c.phones).toEqual(['+2348031234567', '08025551234']);
  });

  it('finds WhatsApp, the profile links (not posts or share buttons) and the contact page', () => {
    expect(c.whatsapp).toBe('+2348031234567');
    expect(c.instagram).toBe('https://www.instagram.com/mamaput_ph');
    expect(c.facebook).toBe('https://web.facebook.com/mamaputph');
    expect(c.contactPage).toBe('https://mamaput.ng/contact-us');
  });

  it('reads delivery signals', () => {
    expect(c.mentionsDelivery).toBe(true);
    expect(c.competitors).toEqual(['Chowdeck', 'Glovo']);
    expect(c.ordersViaChat).toBe(true);
  });

  it('returns empty results, not guesses, for a page with nothing on it', () => {
    expect(extractContacts('<p>Welcome</p>', 'https://x.ng')).toEqual({
      emails: [], phones: [], whatsapp: null, instagram: null, facebook: null, contactPage: null, mentionsDelivery: false, competitors: [], ordersViaChat: false,
    });
  });
});

describe('contact helpers', () => {
  it('cleanPhone accepts Nigerian formats only', () => {
    expect(cleanPhone('0803 123 4567')).toBe('08031234567');
    expect(cleanPhone('+234 (803) 123-4567')).toBe('+2348031234567');
    expect(cleanPhone('234 803 123 4567')).toBe('+2348031234567');
    expect(cleanPhone('+1 415 555 0100')).toBeNull();
    expect(cleanPhone('12345')).toBeNull();
  });

  it('waNumber gives the international form WhatsApp links need', () => {
    expect(waNumber('0803 123 4567')).toBe('2348031234567');
    expect(waNumber('+2348031234567')).toBe('2348031234567');
  });

  it('pickEmail prefers the address on the business domain', () => {
    expect(pickEmail(['owner@gmail.com', 'info@shop.ng'], 'https://www.shop.ng/home')).toBe('info@shop.ng');
    expect(pickEmail(['owner@gmail.com'], 'https://shop.ng')).toBe('owner@gmail.com');
    expect(pickEmail([], 'https://shop.ng')).toBeNull();
  });

  it('linkKind spots social profiles used as a website', () => {
    expect(linkKind('https://www.instagram.com/shop')).toBe('instagram');
    expect(linkKind('https://m.facebook.com/shop')).toBe('facebook');
    expect(linkKind('https://wa.me/2348031234567')).toBe('whatsapp');
    expect(linkKind('https://shop.ng')).toBe('site');
    expect(linkKind('not a url')).toBe('site');
  });
});

describe('scoreProspect', () => {
  const base = { category: 'RESTAURANT' as const, city: 'Port Harcourt', address: '1 Aba Rd, Port Harcourt', rating: 4.6, reviewCount: 320, phone: '+2348031234567', email: 'a@b.ng', whatsapp: '+2348031234567', businessStatus: 'OPERATIONAL', signals: { ...noSignals, offersDelivery: true, competitors: ['Chowdeck'], ordersViaChat: true } };

  it('gives a strong, reachable, delivery-ready business in the right city the full 100', () => {
    const { score, reasons } = scoreProspect(base, { city: 'Port Harcourt' });
    expect(score).toBe(100);
    expect(reasons.map((r) => r.points)).toEqual([20, 10, 15, 15, 10, 10, 5, 10, 5]);
  });

  it('scores missing readings as 0 and says they were not recorded', () => {
    const { score, reasons } = scoreProspect({ ...base, rating: null, reviewCount: null, phone: null, email: null, whatsapp: null, signals: noSignals }, { city: 'Port Harcourt' });
    expect(score).toBe(30);
    expect(reasons.map((r) => r.label)).toEqual(expect.arrayContaining(['Rating not recorded', 'Review count not recorded', 'No phone number found', 'No email found']));
  });

  it('gives nothing for the wrong city or an unclear category, and skips the city test when none was asked for', () => {
    expect(scoreProspect({ ...base, city: 'Aba', address: '5 Market Rd, Aba' }, { city: 'Port Harcourt' }).score).toBe(90);
    expect(scoreProspect({ ...base, category: null }, { city: 'Port Harcourt' }).score).toBe(80);
    expect(scoreProspect(base, { city: null }).score).toBe(90);
  });

  it('scores a closed business 0 whatever else is true', () => {
    expect(scoreProspect({ ...base, businessStatus: 'CLOSED_PERMANENTLY' }, { city: 'Port Harcourt' })).toEqual({ score: 0, reasons: [{ label: 'Closed permanently', points: 0 }] });
  });

  it('steps popularity down with rating and review count', () => {
    const pts = (rating: number, reviewCount: number) => scoreProspect({ ...base, rating, reviewCount, signals: noSignals, whatsapp: null, phone: null, email: null }, { city: null }).score - 20;
    expect(pts(4.0, 50)).toBe(23);
    expect(pts(3.5, 10)).toBe(12);
    expect(pts(3.0, 1)).toBe(2);
    expect(pts(2.0, 0)).toBe(0);
  });
});

describe('matchVendor', () => {
  const vendors = [
    { id: 'v1', name: 'Mama Put Kitchen Ltd', city: 'Port Harcourt', phoneKey: '8031234567', email: 'Owner@MamaPut.ng' },
    { id: 'v2', name: 'Corner Pharmacy', city: 'Aba', phoneKey: null, email: null },
  ];
  const p = (o: Partial<Parameters<typeof matchVendor>[0]>) => ({ name: 'Somewhere Else', city: 'Port Harcourt', address: null, phoneKeys: [], emails: [], ...o });

  it('matches on phone, on email, or on the same name in the same city', () => {
    expect(matchVendor(p({ phoneKeys: ['8031234567'] }), vendors)?.id).toBe('v1');
    expect(matchVendor(p({ emails: ['owner@mamaput.ng'] }), vendors)?.id).toBe('v1');
    expect(matchVendor(p({ name: 'MAMA PUT KITCHEN' }), vendors)?.id).toBe('v1');
  });

  it('does not match the same name in a different city, or very short names', () => {
    expect(matchVendor(p({ name: 'Corner Pharmacy', city: 'Port Harcourt' }), vendors)).toBeNull();
    expect(matchVendor(p({ name: 'Ltd' }), [{ id: 'v3', name: 'Co', city: 'Port Harcourt', phoneKey: null, email: null }])).toBeNull();
  });

  it('normalizeName ignores case, punctuation and company suffixes', () => {
    expect(normalizeName("Chidi's Grill & Bar (Nig.) Limited")).toBe('chidi s grill and bar');
  });
});

describe('buildDrafts and rewriteIsFaithful', () => {
  const ctx = { senderName: 'Ada Obi', commissionPercent: 3, signupUrl: 'https://gobuyme.shop/downloads' };
  const business = { name: 'Mama Put Kitchen', category: 'RESTAURANT' as const, city: 'Port Harcourt', area: 'GRA Phase 2', rating: 4.6, reviewCount: 320, signals: { competitors: ['Chowdeck'] } };
  const d = buildDrafts(business, ctx);

  it('uses only facts we hold: name, place, rating, commission, link, sender', () => {
    expect(d.whatsapp).toContain('this is Ada from GoBuyMe');
    expect(d.whatsapp).toContain('4.6 rating from 320 Google reviews');
    expect(d.whatsapp).toContain('commission starts at 3%');
    expect(d.whatsapp).toContain('https://gobuyme.shop/downloads');
    expect(d.whatsapp).toContain('keep using Chowdeck');
    expect(d.emailSubject).toBe('Listing Mama Put Kitchen on GoBuyMe');
    expect(d.emailBody).toContain('restaurants in GRA Phase 2');
    expect(d.callScript.split('\n')).toHaveLength(7);
  });

  it('speaks as the team when the login is a shared account, not a person', () => {
    const team = buildDrafts(business, { ...ctx, senderName: 'GoBuyMe Admin' });
    expect(team.whatsapp).toContain('Hello, this is the GoBuyMe team. I found');
    expect(team.emailBody).toContain('I am writing from GoBuyMe.');
    expect(team.emailBody.trim().endsWith('The GoBuyMe team')).toBe(true);
    expect(buildDrafts(business, { ...ctx, senderName: '' }).callScript).toContain('Say who you are: the GoBuyMe team');
  });

  it('always offers a way to decline', () => {
    expect(d.whatsapp).toMatch(/reply STOP/);
    expect(d.emailBody).toMatch(/will not contact you again/);
  });

  it('says nothing about a rating that is missing or weak', () => {
    const plain = buildDrafts({ ...business, rating: null, reviewCount: null, signals: null, category: null, area: null, city: null }, { ...ctx, commissionPercent: 7.5 });
    expect(plain.whatsapp).not.toMatch(/rating|reviews|null|undefined/);
    expect(plain.whatsapp).toContain('7.5%');
    expect(plain.callScript.split('\n')).toHaveLength(6);
    expect(buildDrafts({ ...business, rating: 3.1 }, ctx).emailBody).not.toMatch(/rating/);
  });

  it('accepts a rewrite that keeps the facts and rejects one that changes them', () => {
    const good = { ...d, whatsapp: `Hi! Ada here from GoBuyMe. Loved your 4.6 rating. Commission starts at 3%. Join: ${ctx.signupUrl}. Reply STOP to opt out.` };
    expect(rewriteIsFaithful(good, d, ctx)).toBe(true);
    expect(rewriteIsFaithful({ ...d, whatsapp: d.whatsapp.replace('3%', '2%') }, d, ctx)).toBe(false);
    expect(rewriteIsFaithful({ ...d, emailBody: d.emailBody.replace(ctx.signupUrl, 'https://evil.example') }, d, ctx)).toBe(false);
    expect(rewriteIsFaithful({ ...d, whatsapp: `${d.whatsapp} Vendors earn 500000 monthly.` }, d, ctx)).toBe(false);
  });
});

describe('places and network guards', () => {
  it('fromGoogle keeps missing values null', () => {
    const p = fromGoogle({ id: 'abc', displayName: { text: 'Shop' }, addressComponents: [{ longText: 'Port Harcourt', types: ['locality'] }, { longText: 'GRA', types: ['sublocality_level_1', 'sublocality'] }] });
    expect(p).toMatchObject({ placeId: 'abc', name: 'Shop', city: 'Port Harcourt', area: 'GRA', rating: null, reviewCount: null, phone: null, website: null, offersDelivery: null });
  });

  it('maxCallsFor counts pages of 20, capped at three', () => {
    expect([maxCallsFor(1), maxCallsFor(20), maxCallsFor(21), maxCallsFor(60), maxCallsFor(500)]).toEqual([1, 1, 2, 3, 3]);
  });

  it('isPrivateAddress blocks internal ranges and allows public ones', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.187', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '102.89.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip)).toBe(false);
  });

  it('nextRunAfter moves a day or a week, and nowhere when unscheduled', () => {
    const from = new Date('2026-11-12T08:00:00Z');
    expect(nextRunAfter('DAILY', from)?.toISOString()).toBe('2026-11-13T08:00:00.000Z');
    expect(nextRunAfter('WEEKLY', from)?.toISOString()).toBe('2026-11-19T08:00:00.000Z');
    expect(nextRunAfter('NONE', from)).toBeNull();
  });
});
