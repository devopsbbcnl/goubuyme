/**
 * Version of the Terms of Service + Privacy Policy that sign-up shows.
 * Change it whenever either document changes in a way people should be told about; each account stores
 * the version it accepted (`User.policyVersion`), so we can prove what was agreed and ask again later.
 */
export const POLICY_VERSION = '2026-11-22';

export type ConsentSource = 'register' | 'google' | 'apple' | 'settings' | 'unsubscribe-link' | 'admin';

interface ConsentInput {
  acceptedTerms?: unknown;
  confirmedAdult?: unknown;
  marketingOptIn?: unknown;
}

/** Minimum age to hold a GoBuyMe account. */
export const MINIMUM_AGE = 18;

/** Machine-readable code the apps look for to ask the person to make the declaration and try again. */
export const AGE_CONFIRMATION_CODE = 'AGE_CONFIRMATION_REQUIRED';

/** True only when the client says the person ticked "I am 18 or older". Anything else is "not declared". */
export function hasAgeDeclaration(input: ConsentInput): boolean {
  return input.confirmedAdult === true;
}

/**
 * The consent columns to write when an account is created. Terms acceptance is only recorded when the
 * client says the person ticked the box (older app builds do not send it, so nothing is claimed for them).
 * Marketing stays off unless the person explicitly chose it.
 */
export function signupConsent(input: ConsentInput, source: ConsentSource, now: Date = new Date()) {
  const accepted = input.acceptedTerms === true;
  const marketing = input.marketingOptIn === true;
  return {
    ...(accepted ? { termsAcceptedAt: now, policyVersion: POLICY_VERSION } : {}),
    ...(hasAgeDeclaration(input) ? { ageConfirmedAt: now } : {}),
    marketingOptIn: marketing,
    ...(marketing ? { marketingConsentAt: now, marketingConsentSource: source } : {}),
  };
}

/** The consent columns to write when someone changes the promotions switch later. */
export function marketingChoice(optIn: boolean, source: ConsentSource, now: Date = new Date()) {
  return optIn
    ? { marketingOptIn: true, marketingConsentAt: now, marketingConsentSource: source }
    : { marketingOptIn: false, marketingConsentAt: null, marketingConsentSource: source };
}
