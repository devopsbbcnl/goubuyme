import { signupConsent, marketingChoice, POLICY_VERSION } from '../policy';

const NOW = new Date('2026-11-22T10:00:00Z');

describe('signupConsent', () => {
  it('records acceptance and the version when the terms box was ticked', () => {
    expect(signupConsent({ acceptedTerms: true }, 'register', NOW)).toEqual({
      termsAcceptedAt: NOW, policyVersion: POLICY_VERSION, marketingOptIn: false,
    });
  });
  it('claims nothing for older app builds that do not send the flag', () => {
    const out = signupConsent({}, 'register', NOW);
    expect(out).toEqual({ marketingOptIn: false });
    expect(out).not.toHaveProperty('termsAcceptedAt');
  });
  it('keeps promotions off unless explicitly chosen, and stamps when and where', () => {
    expect(signupConsent({ acceptedTerms: true, marketingOptIn: 'yes' }, 'register', NOW).marketingOptIn).toBe(false);
    expect(signupConsent({ acceptedTerms: true, marketingOptIn: true }, 'google', NOW)).toMatchObject({
      marketingOptIn: true, marketingConsentAt: NOW, marketingConsentSource: 'google',
    });
  });
});

describe('marketingChoice', () => {
  it('stamps consent when turned on and clears it when turned off', () => {
    expect(marketingChoice(true, 'settings', NOW)).toEqual({ marketingOptIn: true, marketingConsentAt: NOW, marketingConsentSource: 'settings' });
    expect(marketingChoice(false, 'unsubscribe-link', NOW)).toEqual({ marketingOptIn: false, marketingConsentAt: null, marketingConsentSource: 'unsubscribe-link' });
  });
});
