import { Alert } from 'react-native';

/** Code the backend returns when a new account would be created without the age declaration (NDPA). */
export const AGE_CONFIRMATION_CODE = 'AGE_CONFIRMATION_REQUIRED';

/** True when an API error is the backend asking for the age declaration. */
export function needsAgeDeclaration(err: unknown): boolean {
  const e = err as { response?: { data?: { errors?: { code?: string }[] } } };
  return !!e.response?.data?.errors?.some((x) => x?.code === AGE_CONFIRMATION_CODE);
}

/**
 * Ask a first-time Google / Apple user to declare they are 18 or older and accept the terms.
 * Resolves true only if they explicitly confirm.
 */
export function askAgeAndTerms(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Create your account',
      'To continue, please confirm that you are 18 years of age or older and that you agree to the GoBuyMe Terms of Service and Privacy Policy.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'I confirm', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Fields to merge into the sign-in request once the person has confirmed. */
export const AGE_AND_TERMS_FIELDS = { confirmedAdult: true, acceptedTerms: true } as const;
