import { redactText, redactDeep, redactUrl } from '../redact';

describe('redactText', () => {
  it('removes emails, Nigerian and international phone numbers', () => {
    const out = redactText('SMS to +2348031234567 and 08031234567 failed for ada@example.com, also +44 7911 123456') as string;
    expect(out).not.toMatch(/2348031234567|08031234567|ada@example|7911/);
    expect(out).toContain('[phone]');
    expect(out).toContain('[email]');
  });
  it('removes tokens, bearer headers and key=value secrets', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIxIn0.abcdefghijk';
    expect(redactText(`token ${jwt}`)).not.toContain('eyJhbGci');
    expect(redactText('Authorization: Bearer abcdef1234567890')).not.toContain('abcdef1234567890');
    expect(redactText('password=hunter2 otp: "123456"')).not.toMatch(/hunter2|123456/);
  });
  it('removes identity, account and card numbers but keeps short ids and words', () => {
    const out = redactText('NIN 12345678901 account 0123456789 order GBM-1042 status 500') as string;
    expect(out).not.toMatch(/12345678901|0123456789/);
    expect(out).toContain('GBM-1042');
    expect(out).toContain('status 500');
  });
  it('keeps UUIDs readable', () => {
    const id = '3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23';
    expect(redactText(`user ${id} not found`)).toBe(`user ${id} not found`);
  });
  it('passes empty input through', () => {
    expect(redactText(undefined)).toBeUndefined();
    expect(redactText('')).toBe('');
  });
});

describe('redactDeep', () => {
  it('blanks contact and secret keys and cleans nested strings', () => {
    const out = redactDeep({
      to: '+2348031234567', email: 'a@b.com', password: 'x', userId: 'abc',
      providerResponse: { message: 'Number 08031234567 invalid', code: 21 },
      list: ['call 08031234567'],
    });
    expect(out.to).toBe('[redacted]');
    expect(out.email).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(out.userId).toBe('abc');
    expect(out.providerResponse.message).toBe('Number [phone] invalid');
    expect(out.providerResponse.code).toBe(21);
    expect(out.list[0]).toBe('call [phone]');
  });
  it('stops on very deep objects', () => {
    let deep: Record<string, unknown> = { v: 'x' };
    for (let i = 0; i < 12; i++) deep = { n: deep };
    expect(JSON.stringify(redactDeep(deep))).toContain('[truncated]');
  });
});

describe('redactUrl', () => {
  it('drops the query string and fragment', () => {
    expect(redactUrl('/api/v1/auth/verify?email=a@b.com&token=abc#x')).toBe('/api/v1/auth/verify');
    expect(redactUrl(null)).toBeUndefined();
  });
});
