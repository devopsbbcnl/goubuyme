import {
  SendableLead, SkipContext, composeLeadSms, isMobileKey, normalizeSocial, personalizeLead, skipReason, smsSegments,
  smsTemplateProblem, stopLink, suppressionKey, tallyReasons,
} from '../outreach';

const lead = (over: Partial<SendableLead> = {}): SendableLead => ({
  id: 'l1', marketingOptOut: false, convertedUserId: null, phone: '08031234567', phoneKey: '8031234567', email: 'a@shop.ng', ...over,
});
const ctx = (over: Partial<SkipContext> = {}): SkipContext => ({ suppressed: new Set(), recentlyMessaged: new Set(), ...over });

describe('smsSegments', () => {
  it('counts plain text as 160 then 153 per page', () => {
    expect(smsSegments('a'.repeat(160))).toMatchObject({ pages: 1, unicode: false });
    expect(smsSegments('a'.repeat(161)).pages).toBe(2);
    expect(smsSegments('a'.repeat(306)).pages).toBe(2);
    expect(smsSegments('a'.repeat(307)).pages).toBe(3);
  });
  it('counts GSM extension characters twice', () => {
    expect(smsSegments('€'.repeat(80)).pages).toBe(1);
    expect(smsSegments('€'.repeat(81)).pages).toBe(2);
  });
  it('switches to 70/67 once there is an emoji', () => {
    expect(smsSegments('hi 🍔')).toMatchObject({ unicode: true, pages: 1 });
    expect(smsSegments('a'.repeat(70) + '🍔').pages).toBe(2);
  });
  it('is zero pages for nothing', () => expect(smsSegments('').pages).toBe(0));
});

describe('composing', () => {
  it('uses the contact first name, else the business, and keeps {{business}}', () => {
    expect(personalizeLead('Hi {{name}} of {{business}}', { name: 'Mama Put', contactName: 'Ada Obi' })).toBe('Hi Ada of Mama Put');
    expect(personalizeLead('Hi {{ name }}', { name: 'Mama Put', contactName: null })).toBe('Hi Mama Put');
  });
  it('does not treat $ in a name as a replacement pattern', () => {
    expect(personalizeLead('Hi {{name}}', { name: 'Mama $& Kitchen', contactName: null })).toBe('Hi Mama $& Kitchen');
  });
  it('builds a link without a scheme and puts it in the SMS', () => {
    const link = stopLink('https://gobuyme.shop/', 'abc1234567');
    expect(link).toBe('gobuyme.shop/stop/abc1234567');
    const sms = composeLeadSms('Sell on us.', { name: 'X', contactName: null }, link);
    expect(sms).toBe('GoBuyMe: Sell on us. Opt out: gobuyme.shop/stop/abc1234567');
  });
  it('rejects a template that would run past two pages once the link and names are added', () => {
    expect(smsTemplateProblem('Hello {{name}}, join GoBuyMe and get orders.', 'https://gobuyme.shop')).toBeNull();
    expect(smsTemplateProblem('', 'https://gobuyme.shop')).toMatch(/Write/);
    expect(smsTemplateProblem('x'.repeat(241), 'https://gobuyme.shop')).toMatch(/240/);
    // Placeholders at their worst-case 40 characters push a short template over the limit.
    expect(smsTemplateProblem('{{name}} {{name}} {{name}} {{name}} {{name}} {{name}} {{business}} {{business}} join us', 'https://gobuyme.shop')).toMatch(/pages/);
  });
});

describe('skipReason', () => {
  it('lets a clean lead through on both channels', () => {
    expect(skipReason(lead(), 'SMS', ctx())).toBeNull();
    expect(skipReason(lead(), 'EMAIL', ctx())).toBeNull();
  });
  it('never messages an opted-out or already-converted lead', () => {
    expect(skipReason(lead({ marketingOptOut: true }), 'SMS', ctx())).toBe('Opted out');
    expect(skipReason(lead({ convertedUserId: 'u1' }), 'EMAIL', ctx())).toBe('Already has a GoBuyMe account');
  });
  it('needs a real mobile number for SMS', () => {
    expect(skipReason(lead({ phone: null, phoneKey: null }), 'SMS', ctx())).toBe('No phone number');
    expect(skipReason(lead({ phone: '084123456', phoneKey: '4123456000' }), 'SMS', ctx())).toBe('Not a mobile number');
    expect(isMobileKey('7012345678')).toBe(true);
    expect(isMobileKey('6012345678')).toBe(false);
  });
  it('needs an email for email', () => expect(skipReason(lead({ email: null }), 'EMAIL', ctx())).toBe('No email'));
  it('honours the suppression list per channel, even for a different lead record', () => {
    const c = ctx({ suppressed: new Set([suppressionKey('SMS', '8031234567')]) });
    expect(skipReason(lead(), 'SMS', c)).toBe('Opted out');
    expect(skipReason(lead(), 'EMAIL', c)).toBeNull();
    expect(skipReason(lead({ email: 'A@Shop.ng' }), 'EMAIL', ctx({ suppressed: new Set([suppressionKey('EMAIL', 'a@shop.ng')]) }))).toBe('Opted out');
  });
  it('applies the frequency cap', () => {
    expect(skipReason(lead(), 'SMS', ctx({ recentlyMessaged: new Set(['l1']) }))).toBe('Messaged recently');
  });
  it('tallies reasons for the preview', () => {
    expect(tallyReasons([null, 'No email', 'No email', 'Opted out'])).toEqual({ 'No email': 2, 'Opted out': 1 });
  });
});

describe('normalizeSocial', () => {
  it('accepts profile links and handles', () => {
    expect(normalizeSocial('instagram', 'https://instagram.com/mama_put/?hl=en')).toBe('https://www.instagram.com/mama_put');
    expect(normalizeSocial('instagram', '@mama_put')).toBe('https://www.instagram.com/mama_put');
    expect(normalizeSocial('tiktok', 'tiktok.com/@mama.put')).toBe('https://www.tiktok.com/@mama.put');
    expect(normalizeSocial('twitter', 'https://twitter.com/mamaput')).toBe('https://x.com/mamaput');
    expect(normalizeSocial('youtube', 'https://www.youtube.com/@mamaput')).toBe('https://www.youtube.com/@mamaput');
    expect(normalizeSocial('facebook', 'https://m.facebook.com/mamaputph')).toBe('https://www.facebook.com/mamaputph');
    expect(normalizeSocial('facebook', 'https://facebook.com/profile.php?id=1000123456')).toBe('https://www.facebook.com/profile.php?id=1000123456');
  });
  it('rejects posts, share buttons and other sites', () => {
    expect(normalizeSocial('instagram', 'https://instagram.com/p/abc123')).toBeNull();
    expect(normalizeSocial('instagram', 'https://instagram.com/reel/abc')).toBeNull();
    expect(normalizeSocial('twitter', 'https://twitter.com/intent/tweet?text=x')).toBeNull();
    expect(normalizeSocial('tiktok', 'https://www.tiktok.com/discover')).toBeNull();
    expect(normalizeSocial('facebook', 'https://facebook.com/sharer/sharer.php?u=x')).toBeNull();
    expect(normalizeSocial('instagram', 'https://evil.com/instagram.com/shop')).toBeNull();
    expect(normalizeSocial('instagram', 'mamaput.ng')).toBeNull();
  });
  it('treats empty as not recorded and never guesses a Facebook or YouTube page from a bare word', () => {
    expect(normalizeSocial('instagram', '')).toBeNull();
    expect(normalizeSocial('instagram', null)).toBeNull();
    expect(normalizeSocial('facebook', 'mamaput')).toBeNull();
    expect(normalizeSocial('youtube', 'mamaput')).toBeNull();
  });
});
